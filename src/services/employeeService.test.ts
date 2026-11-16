import { describe, it, expect, vi } from 'vitest'
import { PermissionFlagsBits } from 'discord.js'

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
  hireEmployee,
  demoteOwnerToManager,
  demoteOwnerToEmployee,
  demoteToEmployee,
  RoleNotGrantableError,
  RoleHierarchyError,
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


// ---------------------------------------------------------------------------
// Grant-time role re-check (safeAdd, reached through hireEmployee)
// ---------------------------------------------------------------------------

describe('safeAdd grant-time role check', () => {
  function setup(role: { managed?: boolean; position?: number; perms?: bigint[] }) {
    const live = {
      id: 'r1',
      name: 'Employee',
      managed: role.managed ?? false,
      position: role.position ?? 1,
      permissions: { has: (p: bigint) => (role.perms ?? []).includes(p) },
    }
    const guild = {
      id: 'g1',
      roles: { cache: new Map([['r1', live]]) },
      members: { me: { roles: { highest: { position: 50 } } } },
    }
    const member = { guild, roles: { cache: new Map(), add: vi.fn(async () => undefined) } }
    return { guild, member, live }
  }

  it('grants a harmless role', async () => {
    const { guild, member, live } = setup({})
    await hireEmployee(guild as never, member as never, makeConfig())
    expect(member.roles.add).toHaveBeenCalledWith(live)
  })

  it('refuses a role that gained a dangerous permission since it was mapped', async () => {
    const { guild, member } = setup({ perms: [PermissionFlagsBits.ManageRoles] })
    const err = await hireEmployee(guild as never, member as never, makeConfig()).catch((e) => e)
    expect(err).toBeInstanceOf(RoleNotGrantableError)
    expect(err).toBeInstanceOf(RoleHierarchyError)
    expect(member.roles.add).not.toHaveBeenCalled()
  })

  it('grants roles carrying ordinary moderation bits (ManageMessages, KickMembers)', async () => {
    for (const bit of [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers]) {
      const { guild, member, live } = setup({ perms: [bit] })
      await hireEmployee(guild as never, member as never, makeConfig())
      expect(member.roles.add).toHaveBeenCalledWith(live)
    }
  })

  it('refuses Administrator with the escalation message', async () => {
    const { guild, member } = setup({ perms: [PermissionFlagsBits.Administrator] })
    const err = await hireEmployee(guild as never, member as never, makeConfig()).catch((e) => e)
    expect(err).toBeInstanceOf(RoleNotGrantableError)
    expect((err as RoleNotGrantableError).reason).toMatch(/Administrator, Manage Roles.*cannot be granted/)
    expect(member.roles.add).not.toHaveBeenCalled()
  })

  it('refuses managed roles and roles at or above the bot', async () => {
    for (const r of [{ managed: true }, { position: 50 }]) {
      const { guild, member } = setup(r)
      await expect(hireEmployee(guild as never, member as never, makeConfig())).rejects.toBeInstanceOf(RoleNotGrantableError)
      expect(member.roles.add).not.toHaveBeenCalled()
    }
  })

  it('fails closed when the bot position cannot be read', async () => {
    const { guild, member } = setup({})
    ;(guild.members as { me: unknown }).me = null
    ;(guild.members as Record<string, unknown>).fetchMe = async () => {
      throw new Error('boom')
    }
    await expect(hireEmployee(guild as never, member as never, makeConfig())).rejects.toBeInstanceOf(RoleNotGrantableError)
    expect(member.roles.add).not.toHaveBeenCalled()
  })

  describe('owner demotion', () => {
    function demoteSetup() {
      const mk = (id: string, name: string, perms: bigint[] = []) => ({
        id, name, managed: false, position: 1, permissions: { has: (p: bigint) => perms.includes(p) },
      })
      const owner = mk('r3', 'Owner')
      const manager = mk('r2', 'Manager', [PermissionFlagsBits.ManageRoles])
      const employee = mk('r1', 'Employee')
      const guild = {
        id: 'g1',
        roles: { cache: new Map([['r1', employee], ['r2', manager], ['r3', owner]]) },
        members: { me: { roles: { highest: { position: 50 } } } },
      }
      const member = {
        guild,
        roles: {
          cache: new Map([['r3', owner]]),
          add: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      }
      return { guild, member }
    }

    it('demoteOwnerToManager refuses before removing the owner role', async () => {
      const { guild, member } = demoteSetup()
      await expect(demoteOwnerToManager(guild as never, member as never, makeConfig())).rejects.toBeInstanceOf(RoleNotGrantableError)
      expect(member.roles.remove).not.toHaveBeenCalled()
      expect(member.roles.add).not.toHaveBeenCalled()
    })

    it('demoteOwnerToEmployee refuses before removing any role', async () => {
      const { guild, member } = demoteSetup()
      ;(guild.roles.cache.get('r1') as { permissions: unknown }).permissions = {
        has: (p: bigint) => p === PermissionFlagsBits.Administrator,
      }
      await expect(demoteOwnerToEmployee(guild as never, member as never, makeConfig())).rejects.toBeInstanceOf(RoleNotGrantableError)
      expect(member.roles.remove).not.toHaveBeenCalled()
    })

    it('demoteToEmployee refuses before removing the manager role', async () => {
      const { guild, member } = demoteSetup()
      member.roles.cache.set('r2', guild.roles.cache.get('r2') as never)
      ;(guild.roles.cache.get('r1') as { permissions: unknown }).permissions = {
        has: (p: bigint) => p === PermissionFlagsBits.Administrator,
      }
      await expect(demoteToEmployee(guild as never, member as never, makeConfig())).rejects.toBeInstanceOf(RoleNotGrantableError)
      expect(member.roles.remove).not.toHaveBeenCalled()
      expect(member.roles.add).not.toHaveBeenCalled()
    })

    it('demoteOwnerToEmployee removes owner and grants employee when grantable', async () => {
      const { guild, member } = demoteSetup()
      await demoteOwnerToEmployee(guild as never, member as never, makeConfig())
      expect(member.roles.remove).toHaveBeenCalledTimes(1)
      expect(member.roles.add).toHaveBeenCalledTimes(1)
    })
  })
})
