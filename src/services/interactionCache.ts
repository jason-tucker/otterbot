import { randomBytes } from 'crypto'
import type { StaffRank } from '../types/domain'
import type { ResolvedBusiness } from '../types/domain'
import type { BusinessRoster } from './providers/IBusinessProvider'

const TTL_MS = 60 * 60 * 1000 // 1 hour

function makeKey(): string {
  return randomBytes(4).toString('hex')
}

// ---------------------------------------------------------------------------
// Lookup session — for /lookup character display flows
// ---------------------------------------------------------------------------

export interface LookupSession {
  characterId: string
  characterName: string
  businessId: string
  targetDiscordId: string | null
  rank: StaffRank
}

interface LookupCacheEntry {
  data: LookupSession
  expiresAt: number
}

const lookupCache = new Map<string, LookupCacheEntry>()

export function storeLookupSession(data: LookupSession): string {
  const key = makeKey()
  lookupCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  evictLookup()
  return key
}

export function getLookupSession(key: string): LookupSession | null {
  const entry = lookupCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    lookupCache.delete(key)
    return null
  }
  return entry.data
}

function evictLookup() {
  const now = Date.now()
  for (const [key, entry] of lookupCache) {
    if (entry.expiresAt < now) lookupCache.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Business roster session — for /business roster display flows
// ---------------------------------------------------------------------------

export interface BusinessRosterSession {
  resolved: ResolvedBusiness | null
  roster: BusinessRoster
}

interface RosterCacheEntry {
  data: BusinessRosterSession
  expiresAt: number
}

const rosterCache = new Map<string, RosterCacheEntry>()

export function storeBusinessRosterSession(data: BusinessRosterSession): string {
  const key = makeKey()
  rosterCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  evictRoster()
  return key
}

export function getBusinessRosterSession(key: string): BusinessRosterSession | null {
  const entry = rosterCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    rosterCache.delete(key)
    return null
  }
  return entry.data
}

function evictRoster() {
  const now = Date.now()
  for (const [key, entry] of rosterCache) {
    if (entry.expiresAt < now) rosterCache.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Employee session — for /employee management flows
// ---------------------------------------------------------------------------

export interface EmployeeSession {
  commandUserDiscordId: string
  commandUserRank: StaffRank
  targetDiscordId: string
  /** DB business UUID — used for audit logs */
  businessId: string
  /** Config slug — used to look up EmployeeBusinessConfig at runtime */
  businessSlug: string
}

interface EmployeeCacheEntry {
  data: EmployeeSession
  expiresAt: number
}

const employeeCache = new Map<string, EmployeeCacheEntry>()

export function storeEmployeeSession(data: EmployeeSession): string {
  const key = makeKey()
  employeeCache.set(key, { data, expiresAt: Date.now() + TTL_MS })
  evictEmployee()
  return key
}

export function getEmployeeSession(key: string): EmployeeSession | null {
  const entry = employeeCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    employeeCache.delete(key)
    return null
  }
  return entry.data
}

function evictEmployee() {
  const now = Date.now()
  for (const [key, entry] of employeeCache) {
    if (entry.expiresAt < now) employeeCache.delete(key)
  }
}
