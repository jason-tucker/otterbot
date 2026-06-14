/**
 * Single chokepoint for GET requests against the MKE / Euphoric API.
 *
 * Two jobs:
 *
 *  1. **In-flight dedup** — identical concurrent GETs share one HTTP request.
 *     A ticket opening while staff run `/lookup` on the same user, or two
 *     staff looking up the same character, previously fanned out duplicate
 *     requests to the MKE API.
 *
 *  2. **Short-TTL response cache (15 s)** — the `/lookup` multi-character
 *     flow calls `character-profiles/discord/{id}` once to build the select
 *     menu and again when the user picks an option; `getNotes` runs for the
 *     embed and again on View Notes. A few seconds of staleness is fine for
 *     this data; 15 s is short enough that the ticket "Retry" button (4-min
 *     cooldown) can never be served a stale empty result.
 *
 * Only `res.ok` responses are cached — errors and timeouts always retry.
 * Entries are keyed by full URL; the cache is bounded and in-memory only.
 * Write paths (marker creation) invalidate affected URLs via
 * `invalidateMkeCacheWhere` so Add Note → View Notes shows the new marker
 * immediately.
 *
 * The API key travels only in headers and is never part of a cache key or
 * log line.
 */
import { env } from '../config/env'

export interface MkeGetResult {
  ok: boolean
  status: number
  /** Parsed JSON body, or null if the body wasn't valid JSON. */
  data: unknown
}

const CACHE_TTL_MS = 15_000
const CACHE_MAX_ENTRIES = 300

interface CacheEntry {
  at: number
  value: MkeGetResult
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<MkeGetResult>>()

/** Drop every cached entry whose URL contains `substring` (e.g. an encoded CSN). */
export function invalidateMkeCacheWhere(substring: string): void {
  if (!substring) return
  for (const key of [...cache.keys()]) {
    if (key.includes(substring)) cache.delete(key)
  }
}

/** Test hook / cache-invalidator hook — clears everything. */
export function clearMkeCache(): void {
  cache.clear()
}

function trimCache(): void {
  // Map iteration is insertion-ordered → dropping the first key evicts the
  // oldest entry. Entries also lazily expire on read.
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

async function doFetch(url: string, timeoutMs: number): Promise<MkeGetResult> {
  const res = await fetch(url, {
    headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  })
  // Defensive parse — malformed JSON becomes `data: null` instead of throwing
  // into every caller. Non-OK bodies are never read (they can echo PII).
  const data = res.ok ? await res.json().catch(() => null) : null
  return { ok: res.ok, status: res.status, data }
}

/**
 * GET `${EUPHORIC_API_BASE_URL}${path}` with dedup + cache.
 *
 * Network errors / timeouts reject (same contract as bare `fetch`) so callers
 * keep their existing try/catch semantics. Rejections are never cached, and
 * all callers awaiting a deduped in-flight request see the same rejection —
 * identical to each having made its own failing request.
 */
export async function mkeGetJson(path: string, opts?: { timeoutMs?: number }): Promise<MkeGetResult> {
  const url = `${env.EUPHORIC_API_BASE_URL}${path}`

  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  if (hit) cache.delete(url)

  const pending = inFlight.get(url)
  if (pending) return pending

  const promise = doFetch(url, opts?.timeoutMs ?? 8000)
    .then((result) => {
      if (result.ok) {
        cache.set(url, { at: Date.now(), value: result })
        trimCache()
      }
      return result
    })
    .finally(() => {
      inFlight.delete(url)
    })

  inFlight.set(url, promise)
  return promise
}
