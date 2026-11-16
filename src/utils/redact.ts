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
  // ioredis also accepts `?password=` / `?username=` query parameters.
  for (const key of ['password', 'username']) {
    if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '***')
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

/**
 * Replace any `scheme://user:pass@` userinfo inside free text, and mask
 * `?password=` / `&username=` / token / key / secret / access_token / api_key / apikey query values (ioredis accepts them).
 */
export function stripUrlCredentialsInText(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
    .replace(/([?&](?:password|username|token|key|secret|access_token|api_key|apikey)=)[^&\s]+/gi, '$1***')
}

/** Break runs of 3+ backticks so text cannot close a surrounding code fence. */
export function breakCodeFences(text: string): string {
  return text.replace(/`{3,}/g, (m) => m.split('').join('\u200b'))
}
