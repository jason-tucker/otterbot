import { describe, it, expect, vi } from 'vitest'

// Stub modules that pull in the env-validating db client / dotenv at import time.
// The pure permission helpers under test don't touch the db, but the service
// file imports db/client at the top.
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('../config/env', () => ({ env: { sudoRoleIds: [] } }))

import {
  canHire,
  canFire,
  canPromoteToManager,
  canDemoteManager,
  canManageOwner,
  canManageCustomRole,
  type DbEmployeeBusinessConfig,
  type DbCustomRole,
} from './employeeService'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<DbEmployeeBusinessConfig['permissions']> = {}): DbEmployeeBusinessConfig {
  return {
    businessId: 'biz-1',
    slug: 'test',
    name: 'Test Business',
    providerType: 'discord-only',
    roles: {
      employee: { mappingId: 'm1', roleId: 'r1', roleName: 'Employee', label: 'Employee' },
      manager: { mappingId: 'm2', roleId: 'r2', roleName: 'Manager', label: 'Manager' },
      owner: { mappingId: 'm3', roleId: 'r3', roleName: 'Owner', label: 'Owner' },
      custom: [],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: true,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
      allowOwnerRoleFallback: false,
      ...overrides,
    },
  }
}

function makeCustomRole(overrides: Partial<DbCustomRole> = {}): DbCustomRole {
  return {
    mappingId: 'c1',
    roleId: 'cr1',
    roleName: 'Designer',
    label: 'Designer',
    autoGrantEmployee: false,
    minRankToAssign: 'manager',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// canHire
// ---------------------------------------------------------------------------

describe('canHire', () => {
  it('allows manager to hire', () => {
    expect(canHire('manager', false)).toEqual({ allowed: true })
  })

  it('rejects employee with reason', () => {
    const res = canHire('employee', false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/managers and owners can hire/i)
  })

  it('sudo bypass — sudo employee can hire', () => {
    expect(canHire('employee', true)).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canFire
// ---------------------------------------------------------------------------

describe('canFire', () => {
  const config = makeConfig()

  it('allows owner to fire an employee', () => {
    expect(canFire('owner', 'employee', config, false)).toEqual({ allowed: true })
  })

  it('rejects employee firing anyone with reason', () => {
    const res = canFire('employee', 'employee', config, false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/permission/i)
  })

  it('rejects manager firing an owner with reason', () => {
    const res = canFire('manager', 'owner', config, false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/only owners/i)
  })

  it('rejects manager firing a manager with reason', () => {
    const res = canFire('manager', 'manager', config, false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/only owners can remove managers/i)
  })

  it('rejects owner firing owner when ownersCanManageOwners=false', () => {
    const cfg = makeConfig({ ownersCanManageOwners: false })
    const res = canFire('owner', 'owner', cfg, false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/owner management is disabled/i)
  })

  it('sudo bypass — sudo employee can fire owner', () => {
    expect(canFire('employee', 'owner', config, true)).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canPromoteToManager
// ---------------------------------------------------------------------------

describe('canPromoteToManager', () => {
  it('allows owner to promote', () => {
    expect(canPromoteToManager('owner', makeConfig(), false)).toEqual({ allowed: true })
  })

  it('rejects employee with reason', () => {
    const res = canPromoteToManager('employee', makeConfig(), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/permission/i)
  })

  it('rejects manager when managersCanPromote=false', () => {
    const res = canPromoteToManager('manager', makeConfig({ managersCanPromote: false }), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/managers cannot promote/i)
  })

  it('allows manager when managersCanPromote=true', () => {
    expect(canPromoteToManager('manager', makeConfig({ managersCanPromote: true }), false)).toEqual({ allowed: true })
  })

  it('sudo bypass — sudo employee can promote', () => {
    expect(canPromoteToManager('employee', makeConfig(), true)).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canDemoteManager
// ---------------------------------------------------------------------------

describe('canDemoteManager', () => {
  it('allows owner to demote', () => {
    expect(canDemoteManager('owner', makeConfig(), false)).toEqual({ allowed: true })
  })

  it('rejects employee with reason', () => {
    const res = canDemoteManager('employee', makeConfig(), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/permission/i)
  })

  it('rejects manager when managersCanPromote=false', () => {
    const res = canDemoteManager('manager', makeConfig({ managersCanPromote: false }), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/managers cannot demote/i)
  })

  it('sudo bypass — sudo employee can demote', () => {
    expect(canDemoteManager('employee', makeConfig(), true)).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canManageOwner
// ---------------------------------------------------------------------------

describe('canManageOwner', () => {
  it('allows owner when ownersCanManageOwners=true', () => {
    expect(canManageOwner('owner', makeConfig(), false)).toEqual({ allowed: true })
  })

  it('rejects manager with reason', () => {
    const res = canManageOwner('manager', makeConfig(), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/only owners/i)
  })

  it('rejects owner when ownersCanManageOwners=false', () => {
    const res = canManageOwner('owner', makeConfig({ ownersCanManageOwners: false }), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/owner management is disabled/i)
  })

  it('sudo bypass — sudo employee can manage owner', () => {
    expect(canManageOwner('employee', makeConfig({ ownersCanManageOwners: false }), true)).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canManageCustomRole
// ---------------------------------------------------------------------------

describe('canManageCustomRole', () => {
  it('allows owner to manage manager-rank custom role', () => {
    const cr = makeCustomRole({ minRankToAssign: 'manager' })
    expect(canManageCustomRole('owner', cr, makeConfig(), false)).toEqual({ allowed: true })
  })

  it('rejects employee with reason', () => {
    const cr = makeCustomRole()
    const res = canManageCustomRole('employee', cr, makeConfig(), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/special roles/i)
  })

  it('rejects manager assigning an owner-rank custom role with reason', () => {
    const cr = makeCustomRole({ minRankToAssign: 'owner', label: 'Head Designer' })
    const res = canManageCustomRole('manager', cr, makeConfig(), false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/only owners can manage the "Head Designer" role/i)
  })

  it('rejects manager when managersCanAssignCustomRoles=false', () => {
    const cr = makeCustomRole({ minRankToAssign: 'manager' })
    const cfg = makeConfig({ managersCanAssignCustomRoles: false })
    const res = canManageCustomRole('manager', cr, cfg, false)
    expect(res.allowed).toBe(false)
    expect(res.reason).toMatch(/managers cannot assign special roles/i)
  })

  it('allows manager when managersCanAssignCustomRoles=true (default) and minRankToAssign=manager', () => {
    const cr = makeCustomRole({ minRankToAssign: 'manager' })
    expect(canManageCustomRole('manager', cr, makeConfig(), false)).toEqual({ allowed: true })
  })

  it('sudo bypass — sudo employee can manage owner-rank custom role', () => {
    const cr = makeCustomRole({ minRankToAssign: 'owner' })
    expect(canManageCustomRole('employee', cr, makeConfig(), true)).toEqual({ allowed: true })
  })
})
