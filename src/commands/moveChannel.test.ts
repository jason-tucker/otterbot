import { describe, it, expect, vi } from 'vitest'

vi.mock('../config/env', () => ({ env: { sudoRoleIds: [], moveChannelCategoryIds: [] } }))
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('../services/permissionService', () => ({ resolveBusinesses: vi.fn(), hasMinRank: vi.fn() }))
vi.mock('../services/auditService', () => ({ auditSafe: vi.fn() }))
vi.mock('../services/ticketLookup', () => ({ TICKET_CATEGORY_ID: '1101739267908177991' }))

import { canMoveChannel, allowedMoveCategories } from './moveChannel'

const T = '1101739267908177991'
const OTHER = '999999999999999999'

describe('allowedMoveCategories', () => {
  it('defaults to the ticket category when unconfigured', () => {
    expect(allowedMoveCategories([])).toEqual([T])
  })
  it('uses the configured list when set', () => {
    expect(allowedMoveCategories([OTHER])).toEqual([OTHER])
  })
})

describe('canMoveChannel', () => {
  const base = { sudo: false, isManager: true, sourceParentId: T, targetCategoryId: T, allowed: [T] }

  it('allows a manager reordering within an allowed category', () => {
    expect(canMoveChannel(base)).toBe(true)
  })
  it('allows a manager moving a channel from an allowed source to any category', () => {
    expect(canMoveChannel({ ...base, targetCategoryId: OTHER })).toBe(true)
  })
  it('refuses when the source category is not allowed or missing', () => {
    expect(canMoveChannel({ ...base, sourceParentId: OTHER })).toBe(false)
    expect(canMoveChannel({ ...base, sourceParentId: null })).toBe(false)
  })
  it('refuses pulling a channel out of a non-allowed category into an allowed one', () => {
    expect(canMoveChannel({ ...base, sourceParentId: OTHER, targetCategoryId: T })).toBe(false)
  })
  it('refuses non-managers', () => {
    expect(canMoveChannel({ ...base, isManager: false })).toBe(false)
  })
  it('lets sudo move anywhere', () => {
    expect(canMoveChannel({ ...base, sudo: true, isManager: false, sourceParentId: OTHER, targetCategoryId: OTHER })).toBe(true)
  })
})
