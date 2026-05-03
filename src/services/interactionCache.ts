import { randomBytes } from 'crypto'
import type { StaffRank } from '../types/domain'

export interface LookupSession {
  characterId: string
  characterName: string
  businessId: string
  targetDiscordId: string
  rank: StaffRank
}

interface CacheEntry {
  data: LookupSession
  expiresAt: number
}

const TTL_MS = 60 * 60 * 1000 // 1 hour
const cache = new Map<string, CacheEntry>()

export function storeLookupSession(data: LookupSession): string {
  const key = randomBytes(4).toString('hex')
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  evict()
  return key
}

export function getLookupSession(key: string): LookupSession | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function evict() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key)
  }
}
