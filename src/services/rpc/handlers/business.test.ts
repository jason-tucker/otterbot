import { describe, it, expect, vi, beforeEach } from 'vitest'

const GUILD = '100000000000000001'

const state = vi.hoisted(() => ({
  bizRows: [] as Array<Record<string, unknown>>,
  ownerRows: [] as Array<Record<string, unknown>>,
  mappingRows: [] as Array<Record<string, unknown>>,
  config: null as unknown,
}))

const handlers = vi.hoisted(() => new Map<string, (p: unknown, ctx: unknown) => Promise<unknown>>())

vi.mock('../registry', () => ({
  registerVerb: (n: string, h: (p: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(n, h),
}))
vi.mock('../../../config/env', () => ({ env: { sudoRoleIds: [] } }))
vi.mock('../../../db/client', async () => {
  const schema = await vi.importActual<typeof import('../../../db/schema')>('../../../db/schema')
  const rowsFor = (t: unknown) =>
    t === schema.businesses
      ? state.bizRows
      : t === schema.businessOwners
        ? state.ownerRows
        : t === schema.businessRoleMappings
          ? state.mappingRows
          : []
  return {
    db: {
      select: () => ({
        from: (t: unknown) => ({
          where: () => {
            const rows = rowsFor(t)
            return Object.assign(Promise.resolve(rows), { limit: async () => rows })
          },
        }),
      }),
    },
  }
})
vi.mock('../../auditService', () => ({ audit: vi.fn(async () => undefined) }))
vi.mock('../../employeeService', async (orig) => ({
  ...(await orig<typeof import('../../employeeService')>()),
  getEmployeeBusinessConfig: vi.fn(async () => state.config),
}))

import { planRoleSync } from './business'
import type { DbEmployeeBusinessConfig, DbCustomRole } from '../../employeeService'

function entry(roleId: string) {
  return { mappingId: `m-${roleId}`, roleId, roleName: roleId, label: roleId }
}

function makeConfig(
  opts: { autoGrant?: boolean; custom?: DbCustomRole[]; owner?: boolean } = {},
): DbEmployeeBusinessConfig {
  return {
    businessId: 'biz-1',
    slug: 'original-clothing',
    name: 'OC',
    providerType: 'discord-only',
    roles: {
      employee: entry('emp'),
      manager: entry('mgr'),
      owner: opts.owner === false ? null : entry('own'),
      custom: opts.custom ?? [],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: true,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: opts.autoGrant ?? true,
      allowOwnerRoleFallback: false,
    },
  }
}

function custom(roleId: string, autoGrantEmployee: boolean): DbCustomRole {
  return { ...entry(roleId), autoGrantEmployee, minRankToAssign: 'manager' }
}

const HIGHER = new Set(['own', 'mgr'])

describe('planRoleSync', () => {
  it('manager keeps (and gets) base employee when the flag is on', () => {
    expect(planRoleSync({ heldRoleIds: new Set(['mgr']), isDbOwner: false, config: makeConfig(), ownerAndManagerMappingRoleIds: HIGHER }).add).toEqual(['emp'])
    expect(planRoleSync({ heldRoleIds: new Set(['mgr', 'emp']), isDbOwner: false, config: makeConfig(), ownerAndManagerMappingRoleIds: HIGHER }).add).toEqual([])
  })

  it('manager does not get base employee when the flag is off', () => {
    const plan = planRoleSync({ heldRoleIds: new Set(['mgr']), isDbOwner: false, config: makeConfig({ autoGrant: false }), ownerAndManagerMappingRoleIds: HIGHER })
    expect(plan.add).toEqual([])
  })

  it('a Discord-role owner without a DB row loses nothing and gains nothing', () => {
    const plan = planRoleSync({ heldRoleIds: new Set(['own', 'mgr', 'emp']), isDbOwner: false, config: makeConfig(), ownerAndManagerMappingRoleIds: HIGHER })
    expect(plan.add).toEqual([])
  })

  it('custom role grants base employee only when autoGrantEmployee is true', () => {
    expect(planRoleSync({ heldRoleIds: new Set(['c1']), isDbOwner: false, config: makeConfig({ custom: [custom('c1', false)] }), ownerAndManagerMappingRoleIds: HIGHER }).add).toEqual([])
    expect(planRoleSync({ heldRoleIds: new Set(['c1']), isDbOwner: false, config: makeConfig({ custom: [custom('c1', true)] }), ownerAndManagerMappingRoleIds: HIGHER }).add).toEqual(['emp'])
  })

  it('DB owner lacking the owner role gets it (plus base employee)', () => {
    expect(planRoleSync({ heldRoleIds: new Set(), isDbOwner: true, config: makeConfig(), ownerAndManagerMappingRoleIds: HIGHER }).add).toEqual(['own', 'emp'])
    expect(planRoleSync({ heldRoleIds: new Set(['emp']), isDbOwner: true, config: makeConfig({ owner: false }), ownerAndManagerMappingRoleIds: new Set(['mgr']) }).add).toEqual([])
  })
})

function makeMember(id: string, roleIds: string[]) {
  const cache = new Map<string, object>(roleIds.map((r) => [r, {}]))
  return {
    id,
    roles: {
      cache,
      add: vi.fn(async (rid: string) => {
        cache.set(rid, {})
      }),
      remove: vi.fn(async () => undefined),
    },
  }
}

describe('business.sync_roles handler', () => {
  const A = '200000000000000001'
  const B = '200000000000000002'
  let members: Map<string, ReturnType<typeof makeMember>>
  let ctx: { client: unknown; requestId: string; ts: number }

  beforeEach(() => {
    state.bizRows = [{ id: 'biz-1', slug: 'original-clothing', providerType: 'discord-only', guildId: GUILD, active: true }]
    state.ownerRows = [{ businessId: 'biz-1', discordUserId: B }]
    state.mappingRows = [
      { id: 'm1', roleId: 'emp', rank: 'employee', isBase: true },
      { id: 'm2', roleId: 'mgr', rank: 'manager', isBase: false },
      { id: 'm3', roleId: 'own', rank: 'owner', isBase: false },
    ]
    state.config = makeConfig()
    members = new Map([
      // Discord-role owner without a business_owners row.
      [A, makeMember(A, ['own', 'mgr', 'emp'])],
      // DB owner holding only the employee role.
      [B, makeMember(B, ['emp'])],
    ])
    const guild = {
      members: {
        cache: members,
        fetch: async (id: string) => {
          const m = members.get(id)
          if (!m) throw new Error('unknown member')
          return m
        },
      },
    }
    ctx = { client: { guilds: { fetch: async () => guild } }, requestId: 'r1', ts: Date.now() }
  })

  it('never removes roles and keeps the {added, removed, skipped} reply shape', async () => {
    const res = await handlers.get('business.sync_roles')!({ businessSlug: 'original-clothing' }, ctx)
    expect(res).toEqual({ ok: true, data: { added: 1, removed: 0, skipped: [] } })
    for (const m of members.values()) expect(m.roles.remove).not.toHaveBeenCalled()
    expect(members.get(B)!.roles.add).toHaveBeenCalledWith('own')
  })

  it('refuses McKenzie and inactive businesses', async () => {
    state.bizRows = [{ id: 'biz-m', slug: 'mckenzie', providerType: 'mckenzie', guildId: GUILD, active: true }]
    expect(await handlers.get('business.sync_roles')!({ businessSlug: 'mckenzie' }, ctx)).toEqual({ ok: false, error: 'mke-not-supported' })
    state.bizRows = [{ id: 'biz-1', slug: 'original-clothing', providerType: 'discord-only', guildId: GUILD, active: false }]
    expect(await handlers.get('business.sync_roles')!({ businessSlug: 'original-clothing' }, ctx)).toEqual({ ok: false, error: 'business-inactive' })
    for (const m of members.values()) {
      expect(m.roles.add).not.toHaveBeenCalled()
      expect(m.roles.remove).not.toHaveBeenCalled()
    }
  })
})

describe('business.user_ranks', () => {
  it('returns db-error without the raw message', async () => {
    const { db } = await import('../../../db/client')
    const spy = vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('connection refused at 10.0.0.5')
    })
    const res = await handlers.get('business.user_ranks')!({ userId: '200000000000000001' }, { client: {}, requestId: 'r', ts: 0 })
    expect(res).toEqual({ ok: false, error: 'db-error' })
    spy.mockRestore()
  })
})
