/**
 * Cache-invalidation subscriber. Listens on `bot.otter.settings.invalidate`
 * for fire-and-forget events from botpanel telling us a row we cache in
 * memory was just mutated, and reloads the relevant cache.
 *
 * Without this, panel writes to (e.g.) `business_messages` were correct in
 * the DB but invisible to the bot until restart. Tracked as botpanel #33 /
 * V3-1.
 *
 * Envelope shape (panel-side `web/src/lib/events/invalidate.ts`):
 *   { ts: number, hmac: string, params: { table: string, key?: string } }
 *   hmac = HMAC-SHA256(BOTPANEL_RPC_SECRET, `${channel}|${ts}|${stringified-params}`)
 *
 * Note: this envelope is *not* the same shape as the rpcServer envelope
 * (which carries `requestId` for request/reply). Invalidate is one-way and
 * fire-and-forget — no requestId. `ts` is epoch milliseconds, so replay is
 * bounded by a ±30 s window, and the hmac itself is the dedupe key (a captured
 * envelope replayed inside the window is dropped as a duplicate).
 *
 * Posture:
 *  - Bad HMAC → drop silently + warn (same as rpcServer).
 *  - `ts` outside ±30 s of now → drop as stale; repeated hmac → drop as duplicate.
 *  - Missing `BOTPANEL_RPC_SECRET` → don't subscribe; log once at boot.
 *  - Reload errors caught and warned; never crash the bot.
 */
import Redis, { type RedisOptions } from 'ioredis'
import { env } from '../config/env'
import { createLogger } from '../utils/logger'
import { hmacSha256, timingSafeCompare } from '../utils/hmac'
import { invalidateBusinessMessageCache } from './businessMessagesService'
import { invalidateKnownMckenzieBusinesses } from './mckenzieBusinessCache'

const logger = createLogger('cacheInvalidator')

const CHANNEL = 'bot.otter.settings.invalidate'

type InvalidateEnvelope = {
  ts: number
  hmac: string
  params: { table?: unknown; key?: unknown }
}

function isValidEnvelope(obj: unknown): obj is InvalidateEnvelope {
  if (!obj || typeof obj !== 'object') return false
  const e = obj as Record<string, unknown>
  return (
    typeof e.ts === 'number' && Number.isFinite(e.ts) &&
    typeof e.hmac === 'string' && e.hmac.length > 0 &&
    typeof e.params === 'object' && e.params !== null
  )
}

async function handleInvalidate(params: { table?: unknown; key?: unknown }): Promise<void> {
  const table = typeof params.table === 'string' ? params.table : ''
  const key = typeof params.key === 'string' ? params.key : undefined
  switch (table) {
    case 'business_messages':
      // `key` is the businessId. If absent, fall back to clearing every
      // business — coarser but still correct.
      if (key) {
        logger.info(`cacheInvalidator: invalidate business_messages business=${key}`)
        invalidateBusinessMessageCache(key)
      } else {
        logger.warn('cacheInvalidator: business_messages invalidate without key — no-op (panel always sends businessId)')
      }
      return
    case 'mckenzie_businesses':
    case 'business_owners':
    case 'business_role_mappings':
    case 'businesses':
      // Roster / ownership / business-row changes ripple through the
      // McKenzie business cache. Drop and lazy-rebuild on next read.
      // (`businesses` also covers the panel writing `settings` JSONB —
      // e.g. the OC-stock access rules; nothing bot-side caches that key
      // today, but the event should not log as an unknown table.)
      logger.info(`cacheInvalidator: invalidate mckenzie_businesses (table=${table})`)
      invalidateKnownMckenzieBusinesses()
      return
    case '':
      logger.warn('cacheInvalidator: envelope had no table — ignoring')
      return
    default:
      logger.warn(`cacheInvalidator: unknown table ${table} — no-op`)
      return
  }
}

const REPLAY_WINDOW_MS = 30_000
const SEEN_CAP = 1000
/** hmac hex → ts, insertion-ordered so the oldest entry is evicted first. */
const seen = new Map<string, number>()

/** Test hook — reset dedupe state. */
export function _resetInvalidatorState(): void {
  seen.clear()
}

export type AcceptResult =
  | { ok: true; params: { table?: unknown; key?: unknown } }
  | { ok: false; reason: 'malformed' | 'hmac' | 'stale' | 'duplicate' }

/**
 * Parse + authenticate one envelope. Order: parse, HMAC, window, dedupe (the
 * window is checked before the dedupe map so stale envelopes never occupy it).
 */
export function acceptInvalidate(channel: string, raw: string, secret: string, now: number): AcceptResult {
  let envelope: InvalidateEnvelope
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidEnvelope(parsed)) return { ok: false, reason: 'malformed' }
    envelope = parsed
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const wire = `${channel}|${envelope.ts}|${JSON.stringify(envelope.params)}`
  if (!timingSafeCompare(hmacSha256(secret, wire), envelope.hmac)) return { ok: false, reason: 'hmac' }
  if (Math.abs(now - envelope.ts) > REPLAY_WINDOW_MS) return { ok: false, reason: 'stale' }
  if (seen.has(envelope.hmac)) return { ok: false, reason: 'duplicate' }
  seen.set(envelope.hmac, envelope.ts)
  if (seen.size > SEEN_CAP) {
    const oldest = seen.keys().next().value
    if (oldest !== undefined) seen.delete(oldest)
  }
  return { ok: true, params: envelope.params }
}

let subscriber: Redis | null = null

export function startCacheInvalidator(): void {
  if (!env.BOTPANEL_RPC_SECRET) {
    logger.warn('cacheInvalidator: BOTPANEL_RPC_SECRET unset — cache-invalidate subscriber DISABLED. Panel edits to business_messages and roster tables will require a bot restart to take effect.')
    return
  }
  if (subscriber) {
    logger.warn('cacheInvalidator: already started — ignoring duplicate start')
    return
  }
  const opts: RedisOptions = {
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
    enableOfflineQueue: true,
  }
  const r = new Redis(env.REDIS_URL, opts)
  r.on('error', (err: Error) => {
    logger.warn(`cacheInvalidator: subscriber error: ${err.message}`)
  })
  r.on('message', async (channel: string, message: string) => {
    if (channel !== CHANNEL) return
    const result = acceptInvalidate(channel, message, env.BOTPANEL_RPC_SECRET!, Date.now())
    if (!result.ok) {
      logger.warn(`cacheInvalidator: dropping envelope on ${channel} (${result.reason})`)
      return
    }
    try {
      await handleInvalidate(result.params)
    } catch (err) {
      logger.warn(`cacheInvalidator: handler error: ${(err as Error)?.message ?? err}`)
    }
  })
  r.connect()
    .then(() => r.subscribe(CHANNEL))
    .then(() => {
      logger.info(`cacheInvalidator: subscribed to ${CHANNEL}`)
    })
    .catch((err: Error) => {
      logger.warn(`cacheInvalidator: subscribe failed: ${err.message}`)
    })
  subscriber = r
}

/** Close the subscriber connection. Idempotent. */
export async function closeCacheInvalidator(): Promise<void> {
  const r = subscriber
  if (!r) return
  subscriber = null
  try {
    await r.quit()
  } catch (err) {
    logger.warn(`cacheInvalidator: quit failed: ${(err as Error)?.message ?? err}`)
  }
}
