import { randomBytes } from 'crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { StaffRank } from '../types/domain'
import type { ResolvedBusiness } from '../types/domain'
import type { BusinessRoster } from './providers/IBusinessProvider'
import { db } from '../db/client'
import { lookupSessions } from '../db/schema'

const TTL_MS = 60 * 60 * 1000 // 1 hour
const LOOKUP_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours — survives bot restarts via DB
const MAX_ENTRIES = 200
const SWEEP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

function makeKey(): string {
  return randomBytes(16).toString('hex')
}

// Map iteration is insertion-ordered, so dropping `keys().next().value` gives
// a poor-man's LRU. Refresh-on-read isn't needed — sessions are short-lived.
function trimToMax<V>(cache: Map<string, V>): void {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

// ---------------------------------------------------------------------------
// Lookup session — DB-backed so it survives bot restarts.
// (Other session caches stay in-memory; they're tied to short-lived flows.)
// ---------------------------------------------------------------------------

export interface LookupSession {
  characterId: string
  characterName: string
  characterCsn: string | null
  businessId: string
  targetDiscordId: string | null
  rank: StaffRank
}

export async function storeLookupSession(data: LookupSession): Promise<string> {
  const key = makeKey()
  const expiresAt = new Date(Date.now() + LOOKUP_TTL_MS)
  await db.insert(lookupSessions).values({ key, ...data, expiresAt })
  // Sweep old rows opportunistically; not blocking on errors
  await db.delete(lookupSessions).where(lt(lookupSessions.expiresAt, new Date())).catch(() => {})
  return key
}

export async function getLookupSession(key: string): Promise<LookupSession | null> {
  const [row] = await db
    .select()
    .from(lookupSessions)
    .where(and(eq(lookupSessions.key, key), gt(lookupSessions.expiresAt, new Date())))
    .limit(1)
  if (!row) return null
  return {
    characterId: row.characterId,
    characterName: row.characterName,
    characterCsn: row.characterCsn,
    businessId: row.businessId,
    targetDiscordId: row.targetDiscordId,
    rank: row.rank as StaffRank,
  }
}

// ---------------------------------------------------------------------------
// Business roster session
// ---------------------------------------------------------------------------

export interface BusinessRosterSession {
  resolved: ResolvedBusiness | null
  roster: BusinessRoster
}

interface RosterCacheEntry { data: BusinessRosterSession; expiresAt: number }
const rosterCache = new Map<string, RosterCacheEntry>()

export function storeBusinessRosterSession(data: BusinessRosterSession): string {
  const key = makeKey()
  rosterCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  trimToMax(rosterCache)
  return key
}

export function getBusinessRosterSession(key: string): BusinessRosterSession | null {
  const entry = rosterCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) { rosterCache.delete(key); return null }
  return entry.data
}

function evictRoster() {
  const now = Date.now()
  for (const [k, e] of rosterCache) if (e.expiresAt < now) rosterCache.delete(k)
}

// ---------------------------------------------------------------------------
// Employee session
// ---------------------------------------------------------------------------

export interface EmployeeSession {
  commandUserDiscordId: string
  commandUserRank: StaffRank
  targetDiscordId: string
  businessId: string
  businessSlug: string
}

interface EmployeeCacheEntry { data: EmployeeSession; expiresAt: number }
const employeeCache = new Map<string, EmployeeCacheEntry>()

export function storeEmployeeSession(data: EmployeeSession): string {
  const key = makeKey()
  employeeCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  trimToMax(employeeCache)
  return key
}

export function getEmployeeSession(key: string): EmployeeSession | null {
  const entry = employeeCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) { employeeCache.delete(key); return null }
  return entry.data
}

function evictEmployee() {
  const now = Date.now()
  for (const [k, e] of employeeCache) if (e.expiresAt < now) employeeCache.delete(k)
}

// ---------------------------------------------------------------------------
// Portal session
// ---------------------------------------------------------------------------

export interface PortalSession {
  sudoDiscordId: string
  /** Currently selected business ID, or null if at the main menu */
  businessId: string | null
  guildId: string
}

interface PortalCacheEntry { data: PortalSession; expiresAt: number }
const portalCache = new Map<string, PortalCacheEntry>()

export function storePortalSession(data: PortalSession): string {
  const key = makeKey()
  portalCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  trimToMax(portalCache)
  return key
}

export function getPortalSession(key: string): PortalSession | null {
  const entry = portalCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) { portalCache.delete(key); return null }
  return entry.data
}

export function updatePortalSession(key: string, patch: Partial<PortalSession>): void {
  const entry = portalCache.get(key)
  if (entry) entry.data = { ...entry.data, ...patch }
}

function evictPortal() {
  const now = Date.now()
  for (const [k, e] of portalCache) if (e.expiresAt < now) portalCache.delete(k)
}

// Without a periodic sweep, expired entries linger on an idle bot until
// someone calls a storeX/getX. `.unref()` so the timer doesn't block exit.
const sweepTimer = setInterval(() => {
  evictRoster()
  evictEmployee()
  evictPortal()
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()

export function stopInteractionCacheSweep(): void {
  clearInterval(sweepTimer)
}
