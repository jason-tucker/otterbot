/**
 * Redis event publisher for the botpanel integration.
 *
 * The new botpanel web app subscribes to Redis pub/sub for real-time updates;
 * every meaningful state mutation in otterbot publishes a typed event on a
 * `bot.otter.<domain>.<event>` channel so the panel can keep its view in sync
 * without polling Postgres.
 *
 * Design notes:
 *   - Lazy-singleton ioredis publisher connection (`lazyConnect: true`). The
 *     connection is opened on the first `publish()` and held for the lifetime
 *     of the process. We don't add a subscriber here — this task is publish
 *     only; the command-bus / RPC layer lands in V2.
 *   - **Never throw upstream.** Every `publish()` call attaches its own
 *     `.catch()` and logs a warning instead. The bot's hot path (audit writes,
 *     role mutations, OC stock updates) MUST NOT wait on Redis. Callers wrap
 *     in `void publish(...)` or `publish(...).catch(...)` — the helper does
 *     both belts and braces.
 *   - Payload schemas are TS interfaces here; will be deduped with the panel
 *     once the panel ships and we extract a shared package.
 *
 * See: https://github.com/jason-tucker/botpanel/wiki/Bot-Integration (OtterBot
 * table) for the authoritative channel + payload reference.
 */

import { Redis } from 'ioredis'
import type { Client } from 'discord.js'
import { createLogger } from '../utils/logger'

const logger = createLogger('eventBus')

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379'

// Top-level botpanel namespace. Channels are `bot.<bot>.<domain>.<event>`.
const BOT_NS = 'otter'

// ---------------------------------------------------------------------------
// Lazy-singleton publisher connection
// ---------------------------------------------------------------------------

let publisher: Redis | null = null

function getPublisher(): Redis {
  if (publisher) return publisher
  publisher = new Redis(REDIS_URL, {
    lazyConnect: true,
    // Don't queue commands forever if Redis is down — fail fast and let the
    // bot's hot path move on. The panel can backfill from Postgres if events
    // are dropped during a Redis outage.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      // Backoff capped at 10s. Always retry — we want the publisher to come
      // back online whenever Redis returns. Returning a number = retry after
      // that many ms.
      return Math.min(1000 * Math.pow(2, Math.min(times, 4)), 10_000)
    },
  })

  publisher.on('error', (err: Error) => {
    logger.warn('redis publisher error', { error: err.message })
  })
  publisher.on('connect', () => {
    logger.info('redis publisher connecting', { url: REDIS_URL })
  })
  publisher.on('ready', () => {
    logger.info('redis publisher ready')
  })
  publisher.on('reconnecting', (delay: number) => {
    logger.warn('redis publisher reconnecting', { delay })
  })
  publisher.on('end', () => {
    logger.warn('redis publisher connection ended')
  })

  return publisher
}

// ---------------------------------------------------------------------------
// Typed publish helper
// ---------------------------------------------------------------------------

/**
 * Publish a typed payload on a channel. Never throws — Redis errors are
 * logged and swallowed so the caller's hot path is never blocked by Redis
 * being down.
 *
 * Callers should still `void publish(...)` or `.catch(...)` to make the
 * non-blocking intent obvious at the call site.
 */
export async function publish<T>(channel: string, payload: T): Promise<void> {
  try {
    const client = getPublisher()
    // ioredis lazy-connects on the first command — no need to call connect()
    // explicitly. If Redis is down, `enableOfflineQueue: false` makes this
    // throw immediately rather than buffering.
    const encoded = JSON.stringify(payload)
    await client.publish(channel, encoded)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('publish failed', { channel, error: msg })
  }
}

// ---------------------------------------------------------------------------
// Channel-name helpers (one per top-level domain)
// ---------------------------------------------------------------------------

export function businessCh(event: BusinessEvent): string {
  return `bot.${BOT_NS}.business.${event}`
}

export function ocStockCh(event: OcStockEvent): string {
  return `bot.${BOT_NS}.oc_stock.${event}`
}

export function employeeCh(event: EmployeeEvent): string {
  return `bot.${BOT_NS}.employee.${event}`
}

export function auditCh(event: AuditEvent = 'written'): string {
  return `bot.${BOT_NS}.audit.${event}`
}

export function standingCh(event: StandingEvent = 'set'): string {
  return `bot.${BOT_NS}.standing.${event}`
}

export function notesCh(event: NotesEvent = 'added'): string {
  return `bot.${BOT_NS}.notes.${event}`
}

export function botCh(event: BotEvent): string {
  return `bot.${BOT_NS}.bot.${event}`
}

// ---------------------------------------------------------------------------
// Payload schemas (TS interfaces — will be deduped with panel later)
// ---------------------------------------------------------------------------

export type BusinessEvent =
  | 'created'
  | 'updated'
  | 'deactivated'
  | 'reactivated'
  | 'role_mapping_added'
  | 'role_mapping_removed'
  | 'role_mapping_updated'
  | 'owner_added'
  | 'owner_removed'

export type OcStockEvent =
  | 'item_added'
  | 'item_status'
  | 'item_url'
  | 'item_removed'

export type EmployeeEvent =
  | 'hired'
  | 'fired'
  | 'promoted'
  | 'demoted'
  | 'role_added'
  | 'role_removed'

export type AuditEvent = 'written'
export type StandingEvent = 'set'
export type NotesEvent = 'added'
export type BotEvent = 'ready' | 'heartbeat'

export interface BusinessPayload {
  businessId: string
  by?: string
  ts: string
  delta?: Record<string, unknown>
}

export interface RoleMappingPayload {
  businessId: string
  roleId: string
  mappingId?: string
  by?: string
  ts: string
  delta?: Record<string, unknown>
}

export interface OwnerPayload {
  businessId: string
  userId: string
  by?: string
  ts: string
}

export interface OcStockPayload {
  itemId: string
  status?: string
  by: string
  ts: string
  delta?: Record<string, unknown>
}

export interface EmployeePayload {
  businessId: string
  targetId: string
  action: string
  by: string
  ts: string
  details?: Record<string, unknown>
}

/**
 * Mirrors the shape of the inserted audit_logs row. This is the firehose the
 * panel subscribes to for the live audit-log tail.
 */
export interface AuditPayload {
  actorDiscordId: string
  actorName?: string
  businessId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  success: boolean
  details: Record<string, unknown> | null
  ts: string
}

export interface StandingPayload {
  businessId: string
  characterId: string
  standing: string
  reason?: string | null
  by: string
  ts: string
}

export interface NotesPayload {
  businessId: string
  characterId: string
  by: string
  ts: string
  visibility?: string
}

export interface HeartbeatPayload {
  version: string
  uptime: number
  ts: string
  guildCount?: number
}

export interface ReadyPayload {
  version: string
  ts: string
  guildCount: number
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

let cachedVersion: string | null = null

async function loadVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion
  try {
    const pkg = await import('../../package.json' as any)
    cachedVersion = (pkg as any).version ?? '?'
  } catch {
    cachedVersion = '?'
  }
  return cachedVersion!
}

/**
 * Publish a single heartbeat event. Called every 60s by the tick started in
 * `ready.ts`. Payload mirrors what the panel renders on its bot-status card:
 * version, uptime (seconds), ISO timestamp.
 */
export async function publishHeartbeat(client: Client): Promise<void> {
  const version = await loadVersion()
  const payload: HeartbeatPayload = {
    version,
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
    guildCount: client.guilds.cache.size,
  }
  await publish(botCh('heartbeat'), payload)
}

/**
 * Publish the one-shot `bot.ready` event on startup. Sent from `ready.ts`
 * right after `initPresence`.
 */
export async function publishReady(client: Client): Promise<void> {
  const version = await loadVersion()
  const payload: ReadyPayload = {
    version,
    ts: new Date().toISOString(),
    guildCount: client.guilds.cache.size,
  }
  await publish(botCh('ready'), payload)
}

/**
 * Exposed for graceful-shutdown wiring. Idempotent.
 */
export async function closeEventBus(): Promise<void> {
  if (!publisher) return
  try {
    await publisher.quit()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('redis publisher quit failed', { error: msg })
  }
  publisher = null
}
