import { randomBytes } from 'crypto'
import type { StaffRank } from '../types/domain'
import type { ResolvedBusiness } from '../types/domain'
import type { BusinessRoster } from './providers/IBusinessProvider'

const TTL_MS = 60 * 60 * 1000 // 1 hour

function makeKey(): string {
  return randomBytes(16).toString('hex')
}

// ---------------------------------------------------------------------------
// Lookup session
// ---------------------------------------------------------------------------

export interface LookupSession {
  characterId: string
  characterName: string
  businessId: string
  targetDiscordId: string | null
  rank: StaffRank
}

interface LookupCacheEntry { data: LookupSession; expiresAt: number }
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
  if (entry.expiresAt < Date.now()) { lookupCache.delete(key); return null }
  return entry.data
}

function evictLookup() {
  const now = Date.now()
  for (const [k, e] of lookupCache) if (e.expiresAt < now) lookupCache.delete(k)
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
  evictRoster()
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
  evictEmployee()
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
  evictPortal()
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
