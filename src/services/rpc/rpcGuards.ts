/**
 * Shared guards for botpanel RPC verbs.
 *
 * - `isMckenzieBusiness`: McKenzie staff live on the external MKE portal, so
 *   every mutating verb refuses it (same code as `business.roster`).
 * - `isProtectedTarget`: the bot itself and `BOT_OWNER_ID` are never targets
 *   of an RPC role mutation. Sudo users stay manageable (manager decision).
 * - `auditRpc`: one `audit_logs` row per RPC mutation attempt. Never throws.
 * - `loadBusinessForPost` / `isChannelInGuild`: post verbs (`oc.*`,
 *   `caked.*`) only send into the owning business's guild.
 */
import { eq } from 'drizzle-orm'
import type { Channel, Client } from 'discord.js'
import { db } from '../../db/client'
import { businesses } from '../../db/schema'
import { env } from '../../config/env'
import { audit } from '../auditService'
import { createLogger } from '../../utils/logger'

const logger = createLogger('rpcGuards')

const SNOWFLAKE_RE = /^\d{17,20}$/

export function isMckenzieBusiness(biz: { providerType: string; slug: string }): boolean {
  return biz.providerType === 'mckenzie' || biz.slug === 'mckenzie' || biz.slug === 'mke'
}

export function isProtectedTarget(userId: string, client: Pick<Client, 'user'>): boolean {
  if (env.BOT_OWNER_ID && userId === env.BOT_OWNER_ID) return true
  const botId = client.user?.id
  return !!botId && userId === botId
}

export interface AuditRpcParams {
  verb: string
  requestId: string
  businessId?: string
  targetId?: string
  before?: unknown
  after?: unknown
  success: boolean
  error?: string
  /** Raw `params.actorUserId`; recorded only when it is a valid snowflake. */
  actorUserId?: unknown
}

export async function auditRpc(p: AuditRpcParams): Promise<void> {
  const details: Record<string, unknown> = { requestId: p.requestId }
  if (p.before !== undefined) details.before = p.before
  if (p.after !== undefined) details.after = p.after
  if (p.error !== undefined) details.error = p.error
  if (typeof p.actorUserId === 'string' && SNOWFLAKE_RE.test(p.actorUserId)) {
    details.actorUserId = p.actorUserId
  }
  try {
    await audit({
      actorDiscordId: 'botpanel',
      actorName: 'botpanel-rpc',
      businessId: p.businessId,
      action: `rpc.${p.verb}`,
      targetType: 'discord_user',
      targetId: p.targetId,
      details,
      success: p.success,
    })
  } catch (err) {
    // An audit failure must never turn a completed mutation into an error.
    logger.warn('rpc audit write failed', {
      verb: p.verb,
      requestId: p.requestId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export type PostBusiness = { id: string; guildId: string }

export async function loadBusinessForPost(
  slug: string,
): Promise<PostBusiness | { error: 'business-not-found' | 'business-inactive' }> {
  const rows = await db
    .select({ id: businesses.id, guildId: businesses.guildId, active: businesses.active })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  if (rows.length === 0) return { error: 'business-not-found' }
  if (!rows[0].active) return { error: 'business-inactive' }
  return { id: rows[0].id, guildId: rows[0].guildId }
}

/** True only for a guild channel in `guildId`; DMs and other guilds fail. */
export function isChannelInGuild(channel: Channel, guildId: string): boolean {
  return 'guildId' in channel && typeof channel.guildId === 'string' && channel.guildId === guildId
}
