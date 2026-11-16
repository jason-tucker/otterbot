import { describe, it, expect, beforeEach } from 'vitest'
import {
  pickRosterViewer,
  clip100,
  checkBusinessCooldown,
  resetBusinessCooldownsForTest,
  BUSINESS_COOLDOWN_MS,
} from './rosterAccess'
import type { ResolvedBusiness, StaffRank } from '../types/domain'

function rb(name: string, rank: StaffRank, apiName?: string): ResolvedBusiness {
  return {
    business: {
      id: `id-${name}`,
      name,
      slug: name.toLowerCase(),
      providerType: 'discord-only',
      guildId: 'g1',
      active: true,
      settings: apiName ? { apiBusinessName: apiName } : {},
      createdAt: new Date(0),
    },
    rank,
  } as ResolvedBusiness
}

describe('pickRosterViewer', () => {
  it('returns null when the viewer has no businesses', () => {
    expect(pickRosterViewer([], 'Anything')).toBeNull()
  })

  it('keeps the rank when the roster matches by business name (trim, case-insensitive)', () => {
    const all = [rb('Alpha', 'owner'), rb('Beta', 'manager')]
    const r = pickRosterViewer(all, '  beta ')
    expect(r?.business.name).toBe('Beta')
    expect(r?.rank).toBe('manager')
  })

  it('matches by apiBusinessName', () => {
    const all = [rb('Alpha', 'owner'), rb('Beta', 'manager', 'McKenzie Enterprises')]
    const r = pickRosterViewer(all, 'mckenzie enterprises')
    expect(r?.business.name).toBe('Beta')
    expect(r?.rank).toBe('manager')
  })

  it('returns null for staff of an unrelated business', () => {
    expect(pickRosterViewer([rb('Alpha', 'owner'), rb('Beta', 'manager')], 'Someone Else')).toBeNull()
  })

  it('lets McKenzie staff view any roster with their own rank', () => {
    const mke = rb('Mke', 'manager')
    mke.business.providerType = 'mckenzie'
    const r = pickRosterViewer([rb('Alpha', 'owner'), mke], 'Someone Else')
    expect(r?.business.name).toBe('Mke')
    expect(r?.rank).toBe('manager')
  })
})

describe('clip100', () => {
  it('leaves short text and clips long text to 100 chars', () => {
    expect(clip100('abc')).toBe('abc')
    expect(clip100('x'.repeat(150)).length).toBe(100)
  })
})

describe('checkBusinessCooldown', () => {
  beforeEach(() => resetBusinessCooldownsForTest())

  it('allows the first call, blocks the second, allows after the window', () => {
    expect(checkBusinessCooldown('u1', 1_000_000)).toBe(0)
    expect(checkBusinessCooldown('u1', 1_000_000 + 1000)).toBeGreaterThan(0)
    expect(checkBusinessCooldown('u2', 1_000_000 + 1000)).toBe(0)
    expect(checkBusinessCooldown('u1', 1_000_000 + BUSINESS_COOLDOWN_MS + 1)).toBe(0)
  })
})
