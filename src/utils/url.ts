/**
 * URL parsing helpers.
 *
 * The OC stock embed renders an item's URL as a markdown link `[name](url)`,
 * so any value we accept gets clicked by everyone in the channel. Allowing
 * arbitrary `URL`-parseable strings would let a manager slip a `javascript:`
 * or `data:` URL into the public embed; we restrict to http(s) only.
 */

/**
 * Parse `input` as an `http:` or `https:` URL. Returns the parsed `URL` on
 * success, or `null` if parsing failed OR the protocol isn't http(s).
 *
 * Use `parseHttpUrlDetailed` instead when you need to distinguish a parse
 * failure from a wrong-protocol failure (e.g. to show different error text).
 */
export function parseHttpUrl(input: string): URL | null {
  const result = parseHttpUrlDetailed(input)
  return result.ok ? result.url : null
}

export type ParseHttpUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'wrong-protocol'; protocol: string }

/**
 * Like `parseHttpUrl` but returns a tagged result so callers can show a
 * different error for "didn't parse at all" vs "parsed but wrong scheme".
 */
export function parseHttpUrlDetailed(input: string): ParseHttpUrlResult {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'wrong-protocol', protocol: parsed.protocol }
  }
  return { ok: true, url: parsed }
}
