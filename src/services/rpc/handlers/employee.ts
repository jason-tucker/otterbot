/**
 * Wave 7c-B — employee management RPC verbs.
 *
 * Exposes the four staff-action surfaces the bot's `/employee` slash command
 * already implements (hire / fire / promote / demote) to the panel via the
 * Redis command bus. Each handler:
 *
 *   1. Validates params (hand-rolled — same posture as the rest of the bot).
 *   2. Resolves `businessSlug` → business row (via raw DB query — there is no
 *      existing `getBusinessBySlug` helper).
 *   3. Resolves `userId` → `GuildMember` on the business's guild.
 *   4. Delegates to `employeeService.*` — DO NOT reimplement role logic here.
 *   5. Returns `{ok:true, data:{before, after}}` so the panel can audit the
 *      rank transition. `before`/`after` are the target's effective
 *      `highestRank` (`'employee'|'manager'|'owner'|null`).
 *
 * Permission gating is intentionally light on the bot side — the panel is the
 * permission boundary (a request that makes it here has already been auth'd by
 * `withAuth` + per-route access checks). HMAC verification on the envelope
 * (rpcServer.ts) is what authenticates "this came from the panel".
 *
 * Registers at module load — `rpcServer.ts` does a side-effect import.
 */

import { eq } from 'drizzle-orm'
import type { Client, Guild, GuildMember } from 'discord.js'
import { registerVerb, type VerbResult } from '../registry'
import { db } from '../../../db/client'
import { businesses } from '../../../db/schema'
import {
  getEmployeeBusinessConfig,
  getTargetStatus,
  hireEmployee,
  fireFromBusiness,
  promoteToManager,
  demoteToEmployee,
  promoteToOwner,
  demoteOwnerToManager,
  type DbEmployeeBusinessConfig,
} from '../../employeeService'
import { isBusinessOwner } from '../../permissionService'
import { addBusinessOwner, removeBusinessOwner } from '../../portalService'

type Rank = 'employee' | 'manager' | 'owner'

const SNOWFLAKE_RE = /^\d{17,20}$/

// ---------------------------------------------------------------------------
// Param validation — hand-rolled to match the lightweight style used in the
// rest of the bot. Returns the typed params on success, or a `{ok:false,...}`
// VerbResult on failure (the handler short-circuits).
// ---------------------------------------------------------------------------

function asRecord(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  return params as Record<string, unknown>
}

function validateCommon(params: unknown): { businessSlug: string; userId: string } | VerbResult {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const { businessSlug, userId } = obj
  if (typeof businessSlug !== 'string' || businessSlug.length === 0)
    return { ok: false, error: 'invalid-business-slug' }
  if (typeof userId !== 'string' || !SNOWFLAKE_RE.test(userId))
    return { ok: false, error: 'invalid-user-id' }
  return { businessSlug, userId }
}

function isVerbResult(v: unknown): v is VerbResult {
  return !!v && typeof v === 'object' && 'ok' in (v as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Resolution — collapses the four-step "slug → biz row → guild → member →
// config" walk used by every handler. Returns either the resolved context or
// a VerbResult-shaped early-return.
// ---------------------------------------------------------------------------

interface ResolvedContext {
  guild: Guild
  member: GuildMember
  config: DbEmployeeBusinessConfig
  businessId: string
}

async function resolveContext(
  client: Client,
  businessSlug: string,
  userId: string,
): Promise<ResolvedContext | VerbResult> {
  const bizRows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1)
  if (bizRows.length === 0) return { ok: false, error: 'business-not-found' }
  const biz = bizRows[0]
  if (!biz.active) return { ok: false, error: 'business-inactive' }

  const guild = client.guilds.cache.get(biz.guildId)
  if (!guild) return { ok: false, error: 'guild-not-found' }

  let member: GuildMember
  try {
    member = await guild.members.fetch(userId)
  } catch {
    return { ok: false, error: 'member-not-found' }
  }

  const config = await getEmployeeBusinessConfig(biz.id, biz.guildId)
  if (!config) return { ok: false, error: 'business-not-configured' }

  return { guild, member, config, businessId: biz.id }
}

async function snapshotRank(
  member: GuildMember,
  config: DbEmployeeBusinessConfig,
  businessId: string,
): Promise<Rank | null> {
  const isDbOwner = await isBusinessOwner(member.id, businessId)
  return getTargetStatus(member, config, isDbOwner).highestRank
}

/**
 * After a role mutation, re-fetch the member so the cached role set reflects
 * the new state. Mirrors what `interactions/buttons/employeeActionButton.ts`
 * does after a successful mutation.
 */
async function refetchMember(guild: Guild, userId: string): Promise<GuildMember> {
  return guild.members.fetch(userId)
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------------------
// employee.hire — params: { businessSlug, userId, rank: 'employee'|'manager'|'owner' }
// ---------------------------------------------------------------------------

registerVerb('employee.hire', async (params, ctx) => {
  const common = validateCommon(params)
  if (isVerbResult(common)) return common
  const obj = asRecord(params)!
  const rank = obj.rank
  if (rank !== 'employee' && rank !== 'manager' && rank !== 'owner')
    return { ok: false, error: 'invalid-rank' }

  const resolved = await resolveContext(ctx.client, common.businessSlug, common.userId)
  if (isVerbResult(resolved)) return resolved
  const { guild, member, config, businessId } = resolved

  const before = await snapshotRank(member, config, businessId)
  try {
    if (rank === 'employee') {
      await hireEmployee(guild, member, config)
    } else if (rank === 'manager') {
      await promoteToManager(guild, member, config)
    } else {
      // owner: grant Discord owner role AND record DB ownership so the
      // effective-rank read agrees with the Discord-side mutation.
      await promoteToOwner(guild, member, config)
      await addBusinessOwner(businessId, member.id, 'panel-rpc')
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  const after = await snapshotRank(await refetchMember(guild, member.id), config, businessId)
  return { ok: true, data: { before, after } }
})

// ---------------------------------------------------------------------------
// employee.fire — params: { businessSlug, userId, reason?: string }
// `reason` is accepted but not consumed by the bot — the panel records it in
// its own audit row alongside the before/after snapshot we return.
// ---------------------------------------------------------------------------

registerVerb('employee.fire', async (params, ctx) => {
  const common = validateCommon(params)
  if (isVerbResult(common)) return common
  const obj = asRecord(params)!
  if (obj.reason !== undefined && typeof obj.reason !== 'string')
    return { ok: false, error: 'invalid-reason' }

  const resolved = await resolveContext(ctx.client, common.businessSlug, common.userId)
  if (isVerbResult(resolved)) return resolved
  const { guild, member, config, businessId } = resolved

  const before = await snapshotRank(member, config, businessId)
  try {
    // If the target is a DB-recorded owner, drop that record too — otherwise
    // we'd strip every Discord role but leave a dangling `business_owners` row
    // that still flags them as effective owner on the next status read.
    const wasDbOwner = await isBusinessOwner(member.id, businessId)
    await fireFromBusiness(guild, member, config)
    if (wasDbOwner) await removeBusinessOwner(businessId, member.id)
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  const after = await snapshotRank(await refetchMember(guild, member.id), config, businessId)
  return { ok: true, data: { before, after } }
})

// ---------------------------------------------------------------------------
// employee.promote — params: { businessSlug, userId }
// Promote one rung: employee → manager, manager → owner. Already-owner is a
// domain error so the panel can surface it instead of pretending it succeeded.
// ---------------------------------------------------------------------------

registerVerb('employee.promote', async (params, ctx) => {
  const common = validateCommon(params)
  if (isVerbResult(common)) return common

  const resolved = await resolveContext(ctx.client, common.businessSlug, common.userId)
  if (isVerbResult(resolved)) return resolved
  const { guild, member, config, businessId } = resolved

  const before = await snapshotRank(member, config, businessId)
  try {
    if (before === null || before === 'employee') {
      await promoteToManager(guild, member, config)
    } else if (before === 'manager') {
      await promoteToOwner(guild, member, config)
      await addBusinessOwner(businessId, member.id, 'panel-rpc')
    } else {
      return { ok: false, error: 'already-at-top-rank' }
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  const after = await snapshotRank(await refetchMember(guild, member.id), config, businessId)
  return { ok: true, data: { before, after } }
})

// ---------------------------------------------------------------------------
// employee.demote — params: { businessSlug, userId }
// Demote one rung: owner → manager, manager → employee.
// ---------------------------------------------------------------------------

registerVerb('employee.demote', async (params, ctx) => {
  const common = validateCommon(params)
  if (isVerbResult(common)) return common

  const resolved = await resolveContext(ctx.client, common.businessSlug, common.userId)
  if (isVerbResult(resolved)) return resolved
  const { guild, member, config, businessId } = resolved

  const before = await snapshotRank(member, config, businessId)
  try {
    if (before === 'owner') {
      await demoteOwnerToManager(guild, member, config)
      // Clear the DB-owner record if present — leaving it would re-promote
      // the target back to effective `owner` on the next status read.
      if (await isBusinessOwner(member.id, businessId)) {
        await removeBusinessOwner(businessId, member.id)
      }
    } else if (before === 'manager') {
      await demoteToEmployee(guild, member, config)
    } else {
      return { ok: false, error: 'already-at-bottom-rank' }
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  const after = await snapshotRank(await refetchMember(guild, member.id), config, businessId)
  return { ok: true, data: { before, after } }
})
