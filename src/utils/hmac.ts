/**
 * HMAC-SHA256 helpers for the botpanel command-bus (RPC) integration.
 *
 * The web panel signs every RPC envelope it publishes on `cmd.otter.*` with
 * an HMAC over `${channel}|${requestId}|${ts}|${JSON.stringify(params)}` using
 * `BOTPANEL_RPC_SECRET`. The bot-side subscriber recomputes the HMAC and
 * compares in constant time before dispatching. Mismatches are silently
 * dropped (with a warn) so a leak of the channel name doesn't tell an
 * attacker anything about the secret.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Compute the lowercase hex HMAC-SHA256 of `message` with `secret`. Returns
 * an empty string if `secret` is falsy — callers that pass an unset secret
 * will naturally fail the constant-time compare against the panel's HMAC.
 */
export function hmacSha256(secret: string, message: string): string {
  if (!secret) return ''
  return createHmac('sha256', secret).update(message).digest('hex')
}

/**
 * Constant-time comparison of two hex strings. Returns false immediately
 * on a length mismatch (which is itself non-secret — both sides know the
 * digest is 64 hex chars), then delegates to `crypto.timingSafeEqual` for
 * the actual byte compare.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  if (a.length === 0) return false
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

/**
 * Sign an RPC reply for publication on `res.<requestId>`.
 *
 *   body = JSON.stringify(result)
 *   hmac = HMAC-SHA256(secret, `res.${requestId}|${requestId}|${ts}|${body}`)
 *   payload = { ...result, ts, hmac }
 *
 * The panel strips `ts`/`hmac`, re-stringifies and compares, so the body must
 * round-trip through JSON.parse/stringify byte-for-byte. We therefore sign the
 * JSON-normalised form (parse(stringify(result))): undefined fields vanish,
 * Dates become strings, and key order is already what the panel will see.
 * Anything that cannot be signed faithfully (non-object result, a top-level
 * `ts`/`hmac` key, or a value JSON cannot encode) is replaced by a signed
 * `{ ok: false, error: 'bad-reply-shape' }`.
 */
export function signRpcReply(
  secret: string,
  requestId: string,
  result: unknown,
  ts: number = Date.now(),
): Record<string, unknown> {
  let normalised: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(result))
    const ok =
      !!parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      !Object.hasOwn(parsed, 'ts') &&
      !Object.hasOwn(parsed, 'hmac')
    normalised = ok
      ? (parsed as Record<string, unknown>)
      : { ok: false, error: 'bad-reply-shape' }
  } catch {
    normalised = { ok: false, error: 'bad-reply-shape' }
  }
  const body = JSON.stringify(normalised)
  const hmac = hmacSha256(secret, `res.${requestId}|${requestId}|${ts}|${body}`)
  return { ...normalised, ts, hmac }
}
