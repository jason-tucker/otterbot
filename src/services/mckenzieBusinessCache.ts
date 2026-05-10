import { db } from '../db/client'
import { businesses } from '../db/schema'
import { eq } from 'drizzle-orm'
import { env } from '../config/env'

export interface KnownBusiness {
  id: string
  name: string
  /** Local DB business slug — handy if callers want to deep-link elsewhere. */
  localSlug: string | null
}

/**
 * Refresh-and-return a UUID -> business map for every active McKenzie-providered
 * business in our local DB. Calls `business-accounts/find?name={name}` for each
 * to resolve its MKE UUID.
 *
 * Memoised for 60 s — the underlying data only changes when sudo edits
 * `/portal`, but every `/lookup` invocation calls this. Without a memo, a
 * burst of staff using `/lookup` simultaneously fans out N×staff parallel
 * HTTP requests to the MKE API. Pass `force` to bypass the cache after a
 * /portal edit if you want the change visible immediately.
 *
 * The MKE API has no UUID-by-id endpoint, so this name-resolve dance is the
 * only way to map the `__businessAccounts__` UUIDs on a character profile to
 * human-readable names.
 */
const MEMO_TTL_MS = 60_000
let memoAt = 0
let memoValue: Map<string, KnownBusiness> | null = null

export function invalidateKnownMckenzieBusinesses(): void {
  memoAt = 0
  memoValue = null
}

export async function refreshKnownMckenzieBusinesses(opts?: { force?: boolean }): Promise<Map<string, KnownBusiness>> {
  if (!opts?.force && memoValue && (Date.now() - memoAt) < MEMO_TTL_MS) {
    return memoValue
  }
  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      settings: businesses.settings,
    })
    .from(businesses)
    .where(eq(businesses.providerType, 'mckenzie'))

  const result = new Map<string, KnownBusiness>()

  await Promise.all(
    rows.map(async (row) => {
      const apiName = ((row.settings?.apiBusinessName as string | undefined) ?? row.name).trim()
      if (!apiName) return
      try {
        const url = `${env.EUPHORIC_API_BASE_URL}/business-accounts/find?name=${encodeURIComponent(apiName)}`
        const res = await fetch(url, {
          headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY },
          signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) return
        const data = await res.json() as { id?: string; name?: string }
        if (!data?.id || !data?.name) return
        result.set(data.id, { id: data.id, name: data.name, localSlug: row.slug })
      } catch {
        // failed lookup → just don't include it; the user-facing display will
        // fall back to "X unknown business account(s)"
      }
    })
  )

  memoValue = result
  memoAt = Date.now()
  return result
}
