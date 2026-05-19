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
 * (which carries `requestId` for request/reply). Invalidate is one-way,
 * idempotent, fire-and-forget — no requestId, no replay window.
 *
 * Posture:
 *  - Bad HMAC → drop silently + warn (same as rpcServer).
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
      // Roster / ownership changes ripple through the McKenzie business
      // cache. Drop and lazy-rebuild on next read.
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
  const r = new Redis(env.REDIS_URL ?? 'redis://redis:6379', opts)
  r.on('error', (err: Error) => {
    logger.warn(`cacheInvalidator: subscriber error: ${err.message}`)
  })
  r.on('message', async (channel: string, message: string) => {
    if (channel !== CHANNEL) return
    let envelope: InvalidateEnvelope
    try {
      const parsed: unknown = JSON.parse(message)
      if (!isValidEnvelope(parsed)) {
        logger.warn(`cacheInvalidator: malformed envelope on ${channel}`)
        return
      }
      envelope = parsed
    } catch (err) {
      logger.warn(`cacheInvalidator: JSON parse failed on ${channel}: ${(err as Error).message}`)
      return
    }
    const wire = `${channel}|${envelope.ts}|${JSON.stringify(envelope.params)}`
    const expected = hmacSha256(env.BOTPANEL_RPC_SECRET!, wire)
    if (!timingSafeCompare(expected, envelope.hmac)) {
      logger.warn(`cacheInvalidator: HMAC mismatch on ${channel} — dropping`)
      return
    }
    try {
      await handleInvalidate(envelope.params)
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
