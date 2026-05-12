/**
 * Bot-side Redis command-bus subscriber for the botpanel integration.
 *
 * The panel publishes signed RPC envelopes on `cmd.otter.<verb>` channels:
 *   { requestId: string, ts: number, hmac: string, params: unknown }
 *
 * For each envelope we:
 *   1. HMAC-verify against `BOTPANEL_RPC_SECRET` (constant-time compare).
 *      Mismatches are silently dropped + warned — we never tell an attacker
 *      whether a guess was close.
 *   2. Replay-check: drop envelopes older than 30 s, and dedupe `requestId`
 *      via an in-memory LRU `Map` capped at 5000 entries.
 *   3. Look up `verb` in the registry; unknown → reply `unknown-verb`.
 *   4. Dispatch handler(params, ctx) and publish the result on
 *      `res.<requestId>` via the existing event-bus publisher (so we don't
 *      keep a third ioredis client around just for replies).
 *
 * Connection-lifecycle notes:
 *   - SEPARATE ioredis client from `eventBus.ts` — once a connection is
 *     in subscribe mode it can't publish, so they must be distinct.
 *   - `lazyConnect: true` + `enableOfflineQueue: false`: the bot must keep
 *     running if Redis is unreachable at boot. Errors are logged + swallowed.
 *   - Singleton — `startRpcServer` is idempotent; calling it twice is a
 *     no-op.
 *
 * To extend: drop a file in `services/rpc/handlers/<verb>.ts` that calls
 * `registerVerb` at module load, then add the side-effect import below.
 */

import { Redis } from 'ioredis'
import type { Client } from 'discord.js'
import { env } from '../config/env'
import { createLogger } from '../utils/logger'
import { hmacSha256, timingSafeCompare } from '../utils/hmac'
import { publish } from './eventBus'
import { getVerb } from './rpc/registry'

// Side-effect imports — registering verbs at module-load is how the registry
// gets populated. Add new verbs here.
import './rpc/handlers/echo'
// Wave 7c-B — employee hire/fire/promote/demote verbs.
import './rpc/handlers/employee'

const logger = createLogger('rpcServer')

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379'
const CHANNEL_PREFIX = 'cmd.otter.'
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`
const REPLAY_WINDOW_MS = 30_000
const SEEN_REQUEST_CAP = 5_000

// ---------------------------------------------------------------------------
// Replay-protection LRU
// ---------------------------------------------------------------------------

/**
 * Insertion-ordered Map of seen `requestId` → first-seen `ts`. When the size
 * hits `SEEN_REQUEST_CAP` we evict the oldest entry (the first key in
 * insertion order) — Map guarantees insertion-ordered iteration, so the
 * `keys().next()` trick is O(1).
 */
const seenRequests = new Map<string, number>()

function markSeen(requestId: string, ts: number): void {
  if (seenRequests.size >= SEEN_REQUEST_CAP) {
    const oldest = seenRequests.keys().next().value
    if (oldest !== undefined) seenRequests.delete(oldest)
  }
  seenRequests.set(requestId, ts)
}

// ---------------------------------------------------------------------------
// Envelope shape — kept narrow on purpose; anything else is rejected.
// ---------------------------------------------------------------------------

interface RpcEnvelope {
  requestId: string
  ts: number
  hmac: string
  params: unknown
}

function parseEnvelope(raw: string): RpcEnvelope | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const e = obj as Record<string, unknown>
  if (typeof e.requestId !== 'string' || e.requestId.length === 0) return null
  if (typeof e.ts !== 'number' || !Number.isFinite(e.ts)) return null
  if (typeof e.hmac !== 'string' || e.hmac.length === 0) return null
  // `params` may be any JSON value (including null/undefined); we don't
  // constrain its shape here — the handler is responsible.
  return {
    requestId: e.requestId,
    ts: e.ts,
    hmac: e.hmac,
    params: e.params,
  }
}

// ---------------------------------------------------------------------------
// Singleton subscriber connection
// ---------------------------------------------------------------------------

let subscriber: Redis | null = null
let started = false

function buildSubscriber(): Redis {
  const sub = new Redis(REDIS_URL, {
    lazyConnect: true,
    // Same posture as the publisher: don't block the bot on Redis being down.
    // ioredis's subscribe is a long-lived command, but offline-queue still
    // controls whether *new* commands buffer during a disconnect.
    enableOfflineQueue: false,
    maxRetriesPerRequest: null, // subscribers should keep retrying forever
    retryStrategy(times) {
      return Math.min(1000 * Math.pow(2, Math.min(times, 4)), 10_000)
    },
  })

  sub.on('error', (err: Error) => {
    logger.warn('redis subscriber error', { error: err.message })
  })
  sub.on('connect', () => {
    logger.info('redis subscriber connecting', { url: REDIS_URL })
  })
  sub.on('ready', () => {
    logger.info('redis subscriber ready')
  })
  sub.on('reconnecting', (delay: number) => {
    logger.warn('redis subscriber reconnecting', { delay })
  })
  sub.on('end', () => {
    logger.warn('redis subscriber connection ended')
  })

  return sub
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the RPC subscriber. Idempotent — second+ calls are no-ops.
 *
 * If `BOTPANEL_RPC_SECRET` is unset we log a warning and skip wiring the
 * subscriber entirely; the bot continues to run as a publish-only client.
 *
 * Never throws — all Redis errors are caught and logged so a misconfigured
 * Redis URL can't take down the bot.
 */
export function startRpcServer(client: Client): void {
  if (started) return
  started = true

  if (!env.BOTPANEL_RPC_SECRET) {
    logger.warn('BOTPANEL_RPC_SECRET unset — RPC subscriber disabled')
    return
  }

  const secret = env.BOTPANEL_RPC_SECRET
  subscriber = buildSubscriber()

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    void handleMessage(client, secret, channel, message)
  })

  subscriber
    .psubscribe(CHANNEL_PATTERN)
    .then((count) => {
      logger.info('rpc subscriber psubscribed', { pattern: CHANNEL_PATTERN, count })
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('psubscribe failed', { pattern: CHANNEL_PATTERN, error: msg })
    })
}

/**
 * Tear down the subscriber. Exposed for graceful-shutdown wiring; idempotent.
 */
export async function closeRpcServer(): Promise<void> {
  if (!subscriber) return
  try {
    await subscriber.quit()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('redis subscriber quit failed', { error: msg })
  }
  subscriber = null
  started = false
}

// ---------------------------------------------------------------------------
// Message handler — pure async function so it can be tested independently
// ---------------------------------------------------------------------------

async function handleMessage(
  client: Client,
  secret: string,
  channel: string,
  message: string,
): Promise<void> {
  if (!channel.startsWith(CHANNEL_PREFIX)) {
    // Shouldn't happen given the pattern, but cheap to guard against.
    return
  }

  const envelope = parseEnvelope(message)
  if (!envelope) {
    logger.warn('rpc envelope parse failed', { channel })
    return
  }

  const { requestId, ts, hmac, params } = envelope

  // HMAC verification — recompute over the canonical pre-image and compare
  // in constant time. We sign `${channel}|${requestId}|${ts}|${JSON.stringify(params)}`;
  // any mutation by an attacker invalidates the signature.
  const preimage = `${channel}|${requestId}|${ts}|${JSON.stringify(params)}`
  const expected = hmacSha256(secret, preimage)
  if (!timingSafeCompare(expected, hmac)) {
    logger.warn('rpc hmac mismatch — dropping', { channel, requestId })
    return
  }

  // Replay window — drop if older than 30 s OR if we've already serviced
  // this requestId. Note: we check the window before the dedupe map so a
  // flood of stale envelopes can't fill the map.
  const now = Date.now()
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) {
    logger.warn('rpc envelope outside replay window — dropping', {
      channel,
      requestId,
      skew: now - ts,
    })
    return
  }
  if (seenRequests.has(requestId)) {
    logger.warn('rpc duplicate requestId — dropping', { channel, requestId })
    return
  }
  markSeen(requestId, ts)

  const verb = channel.slice(CHANNEL_PREFIX.length)
  const handler = getVerb(verb)
  if (!handler) {
    logger.warn('rpc unknown verb', { verb, requestId })
    await sendReply(requestId, { ok: false, error: 'unknown-verb' })
    return
  }

  try {
    const result = await handler(params, { client, requestId, ts })
    await sendReply(requestId, result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('rpc handler threw', { verb, requestId, error: msg })
    await sendReply(requestId, { ok: false, error: 'handler-threw', details: msg })
  }
}

/**
 * Publish a reply via the existing event-bus publisher. Replies go on
 * `res.<requestId>` so the panel can correlate without a sequence number.
 * Errors here are already swallowed by `publish()` itself.
 */
async function sendReply(requestId: string, result: unknown): Promise<void> {
  await publish(`res.${requestId}`, result)
}
