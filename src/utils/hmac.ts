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
