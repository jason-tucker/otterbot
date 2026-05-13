/**
 * `business_messages.*` RPC verbs — read/write the per-business override
 * store for editable `/caked` and `/oc` card bodies. Backs the panel's
 * "Edit message content" UI on `/otter/caked` and `/otter/oc-stock`.
 *
 * Verbs:
 *   business_messages.list   ({businessSlug, actorUserId})           → list keys + bodies + isOverride flag
 *   business_messages.update ({businessSlug, messageKey, body,
 *                              actorUserId})                         → upsert override
 *   business_messages.reset  ({businessSlug, messageKey, actorUserId})→ delete override
 *
 * Permission gating: every verb requires the actor to be manager+ for the
 * resolved business (DB owner OR holds a manager/owner-rank role in the
 * business's guild). The panel already checks the actor's rank before
 * issuing the call, but we re-verify here so a leaked HMAC secret on its
 * own isn't enough to forge a write.
 *
 * messageKey allowlist: writes are validated against
 * `getEditableKeysForSlug(slug)` (the same dictionary the renderers
 * consume). Unknown keys → `unknown-key`. This stops panel bugs (or
 * forged requests) from polluting the table with garbage that never
 * shows up in any rendered card.
 *
 * Cache: writes call `invalidateBusinessMessageCache(businessId)` via the
 * service-layer helpers, so the in-process LRU is purged immediately —
 * the next slash command response renders the new value without waiting
 * for the 60 s TTL.
 *
 * Registers at module load — `rpcServer.ts` does a side-effect import.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../../db/client'
import { businesses, businessRoleMappings, businessOwners } from '../../../db/schema'
import { env } from '../../../config/env'
import { registerVerb, type VerbContext, type VerbResult } from '../registry'
import {
  deleteBusinessMessage,
  getEditableKeysForSlug,
  listBusinessMessages,
  upsertBusinessMessage,
} from '../../businessMessagesService'

const SNOWFLAKE_RE = /^\d{15,25}$/
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BODY_MIN = 1
const BODY_MAX = 4000

type Rank = 'employee' | 'manager' | 'owner'

interface ResolvedBiz {
  id: string
  slug: string
  guildId: string
}

/**
 * Resolve slug → business row. Returns null on miss/inactive; the caller
 * surfaces a verb-level error.
 */
async function loadBusinessBySlug(slug: string): Promise<ResolvedBiz | null> {
  const rows = await db
    .select({ id: businesses.id, slug: businesses.slug, guildId: businesses.guildId, active: businesses.active })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  if (rows.length === 0) return null
  if (!rows[0].active) return null
  return { id: rows[0].id, slug: rows[0].slug, guildId: rows[0].guildId }
}

/**
 * Check `actorUserId` has manager-or-owner rank for `biz`. Three signals:
 *   1. `BOT_OWNER_ID` env match → implicit 'owner' (mirrors how the panel
 *      treats bot-owner as authorized for every business — without this
 *      the bot would refuse manager+ verbs from the bot-owner unless they
 *      happen to hold the right Discord role, which surprised users on
 *      `/otter/caked` and `/otter/oc-stock`).
 *   2. `business_owners` row → 'owner'.
 *   3. Discord role in `biz.guildId` mapped to manager/owner rank. Member
 *      cache lookup with a `.fetch()` fallback for members the bot hasn't
 *      seen recently (mirrors the cache-miss fix on `users.resolve`).
 *
 * Returns the rank, or null if the actor has none of the above.
 */
async function actorRankForBusiness(
  ctx: VerbContext,
  biz: ResolvedBiz,
  actorUserId: string,
): Promise<Rank | null> {
  // Bot-owner short-circuit. Matches the panel's `access.botOwner` gate on
  // every page that calls this verb.
  if (env.BOT_OWNER_ID && actorUserId === env.BOT_OWNER_ID) return 'owner'

  // DB-owner wins regardless of role state.
  const ownerRows = await db
    .select({ id: businessOwners.id })
    .from(businessOwners)
    .where(
      and(
        eq(businessOwners.businessId, biz.id),
        eq(businessOwners.discordUserId, actorUserId),
      ),
    )
    .limit(1)
  if (ownerRows.length > 0) return 'owner'

  const guild = ctx.client.guilds.cache.get(biz.guildId)
  if (!guild) return null

  // Try cache first, fall back to API fetch. The bot has GUILD_MEMBERS
  // intent but doesn't pre-warm the cache at boot — quiet members (no
  // recent typing/voice/reaction activity) miss the cache and used to
  // get a spurious `forbidden`. .fetch() primes the cache for next time.
  let member = guild.members.cache.get(actorUserId)
  if (!member) {
    member = await guild.members.fetch(actorUserId).catch(() => undefined)
  }
  if (!member) return null

  const memberRoleIds = [...member.roles.cache.keys()]
  if (memberRoleIds.length === 0) return null

  const mappings = await db
    .select({ roleId: businessRoleMappings.roleId, rank: businessRoleMappings.rank })
    .from(businessRoleMappings)
    .where(
      and(
        eq(businessRoleMappings.businessId, biz.id),
        eq(businessRoleMappings.guildId, biz.guildId),
        inArray(businessRoleMappings.roleId, memberRoleIds),
      ),
    )

  // Highest rank wins. RANK_ORDER inline rather than importing the
  // bot-internal `domain.ts` enum — keeps the verb self-contained.
  const order: Record<Rank, number> = { employee: 1, manager: 2, owner: 3 }
  let best: Rank | null = null
  for (const m of mappings) {
    if (!best || order[m.rank] > order[best]) best = m.rank
  }
  return best
}

function asRecord(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  return params as Record<string, unknown>
}

function validateActor(obj: Record<string, unknown>): { actorUserId: string } | VerbResult {
  const actorUserId = obj.actorUserId
  if (typeof actorUserId !== 'string' || !SNOWFLAKE_RE.test(actorUserId)) {
    return { ok: false, error: 'invalid-actor-user-id' }
  }
  return { actorUserId }
}

function validateSlug(obj: Record<string, unknown>): { businessSlug: string } | VerbResult {
  const businessSlug = obj.businessSlug
  if (typeof businessSlug !== 'string' || businessSlug.length === 0 || businessSlug.length > 64 || !SLUG_RE.test(businessSlug)) {
    return { ok: false, error: 'invalid-business-slug' }
  }
  return { businessSlug }
}

function isVerbResult(v: unknown): v is VerbResult {
  return !!v && typeof v === 'object' && 'ok' in (v as Record<string, unknown>)
}

// ────────────────────────────────────────────────────────────────────────
// list
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_messages.list', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }

  const slug = validateSlug(obj)
  if (isVerbResult(slug)) return slug
  const actor = validateActor(obj)
  if (isVerbResult(actor)) return actor

  const biz = await loadBusinessBySlug(slug.businessSlug)
  if (!biz) return { ok: false, error: 'business-not-found' }

  const rank = await actorRankForBusiness(ctx, biz, actor.actorUserId)
  if (rank !== 'manager' && rank !== 'owner') {
    return { ok: false, error: 'forbidden' }
  }

  const result = await listBusinessMessages(slug.businessSlug)
  if (!result) return { ok: false, error: 'business-not-found' }

  return {
    ok: true,
    data: {
      businessSlug: slug.businessSlug,
      messages: result.items.map((it) => ({
        key: it.key,
        label: it.label,
        body: it.body,
        defaultBody: it.defaultBody,
        isOverride: it.isOverride,
        updatedAt: it.updatedAt ? it.updatedAt.toISOString() : null,
        updatedBy: it.updatedByDiscordId,
      })),
    },
  }
})

// ────────────────────────────────────────────────────────────────────────
// update
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_messages.update', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }

  const slug = validateSlug(obj)
  if (isVerbResult(slug)) return slug
  const actor = validateActor(obj)
  if (isVerbResult(actor)) return actor

  const messageKey = obj.messageKey
  if (typeof messageKey !== 'string' || messageKey.length === 0 || messageKey.length > 128) {
    return { ok: false, error: 'invalid-message-key' }
  }
  const body = obj.body
  if (typeof body !== 'string' || body.length < BODY_MIN || body.length > BODY_MAX) {
    return { ok: false, error: 'invalid-body' }
  }

  const allow = getEditableKeysForSlug(slug.businessSlug)
  if (!(messageKey in allow)) {
    return { ok: false, error: 'unknown-key' }
  }

  const biz = await loadBusinessBySlug(slug.businessSlug)
  if (!biz) return { ok: false, error: 'business-not-found' }

  const rank = await actorRankForBusiness(ctx, biz, actor.actorUserId)
  if (rank !== 'manager' && rank !== 'owner') {
    return { ok: false, error: 'forbidden' }
  }

  try {
    const row = await upsertBusinessMessage(biz.id, messageKey, body, actor.actorUserId)
    return {
      ok: true,
      data: {
        key: row.key,
        body: row.body,
        updatedAt: row.updatedAt.toISOString(),
      },
    }
  } catch (err) {
    return { ok: false, error: 'write-failed', details: err instanceof Error ? err.message : String(err) }
  }
})

// ────────────────────────────────────────────────────────────────────────
// reset
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_messages.reset', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }

  const slug = validateSlug(obj)
  if (isVerbResult(slug)) return slug
  const actor = validateActor(obj)
  if (isVerbResult(actor)) return actor

  const messageKey = obj.messageKey
  if (typeof messageKey !== 'string' || messageKey.length === 0 || messageKey.length > 128) {
    return { ok: false, error: 'invalid-message-key' }
  }

  // Reset is bounded to the allowlist too — we never want to delete an
  // unknown row even though it could only have got there via a write
  // verb we also gate, just keeping the surface symmetric.
  const allow = getEditableKeysForSlug(slug.businessSlug)
  if (!(messageKey in allow)) {
    return { ok: false, error: 'unknown-key' }
  }

  const biz = await loadBusinessBySlug(slug.businessSlug)
  if (!biz) return { ok: false, error: 'business-not-found' }

  const rank = await actorRankForBusiness(ctx, biz, actor.actorUserId)
  if (rank !== 'manager' && rank !== 'owner') {
    return { ok: false, error: 'forbidden' }
  }

  try {
    const deleted = await deleteBusinessMessage(biz.id, messageKey)
    return { ok: true, data: { key: messageKey, deleted } }
  } catch (err) {
    return { ok: false, error: 'delete-failed', details: err instanceof Error ? err.message : String(err) }
  }
})
