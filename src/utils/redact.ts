/**
 * Redaction helpers for values that may carry credentials and are safe to
 * log only in masked form.
 */

/**
 * Mask the userinfo part of a connection URL so it can be logged.
 *
 *   redis://user:pass@redis:6379/0 -> redis://***@redis:6379/0
 *   redis://redis:6379             -> redis://redis:6379 (unchanged)
 *
 * Unparseable input returns '[redacted]' rather than the raw string, so a
 * malformed URL that still holds a password never reaches the logs.
 */
export function redactUrlCredentials(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return '[redacted]'
  }
  if (!parsed.username && !parsed.password) return parsed.toString()
  parsed.username = ''
  parsed.password = ''
  // `URL` drops the '@' once userinfo is empty; re-insert a mask after the
  // scheme separator so readers still see that credentials were present.
  const s = parsed.toString()
  const sep = `${parsed.protocol}//`
  return s.startsWith(sep) ? `${sep}***@${s.slice(sep.length)}` : '[redacted]'
}
