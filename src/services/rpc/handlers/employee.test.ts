import { describe, it, expect, vi, beforeEach } from 'vitest'

const BOT_ID = '900000000000000001'
const BOT_OWNER = '900000000000000002'
const GUILD = '100000000000000001'
const USER = '200000000000000001'

const state = vi.hoisted(() => ({
  bizRows: [] as Array<Record<string, unknown>>,
  dbOwner: false,
  config: null as unknown,
}))

const handlers = vi.hoisted(() => new Map<string, (p: unknown, ctx: unknown) => Promise<unknown>>())

vi.mock('../registry', () => ({
  registerVerb: (n: string, h: (p: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(n, h),
}))
vi.mock('../../../config/env', () => ({ env: { BOT_OWNER_ID: '900000000000000002', sudoRoleIds: [] } }))
vi.mock('../../../db/client', () => {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => state.bizRows
  return { db: { select: () => chain } }
})
vi.mock('../../auditService', () => ({ audit: vi.fn(async () => undefined) }))
vi.mock('../../permissionService', () => ({ isBusinessOwner: vi.fn(async () => state.dbOwner) }))
vi.mock('../../portalService', () => ({
  addBusinessOwner: vi.fn(async () => undefined),
  removeBusinessOwner: vi.fn(async () => {
    state.dbOwner = false
  }),
}))
vi.mock('../../employeeService', async (orig) => ({
  ...(await orig<typeof import('../../employeeService')>()),
  getEmployeeBusinessConfig: vi.fn(async () => state.config),
}))

import { audit } from '../../auditService'
import { removeBusinessOwner } from '../../portalService'
import './employee'

class RoleCache<V> extends Map<string, V> {
  find(fn: (v: V) => boolean): V | undefined {
    for (const v of this.values()) if (fn(v)) return v
    return undefined
  }
}

type FakeRole = { id: string; name: string; managed?: boolean; position?: number; permissions?: { has(p: bigint): boolean } }

// Live role as the grant-time re-check sees it: harmless, below the bot.
const safeRole = (id: string): FakeRole => ({ id, name: id, managed: false, position: 1, permissions: { has: () => false } })

function makeMember(id: string, roleIds: string[]) {
  const cache = new Map<string, FakeRole>(roleIds.map((r) => [r, { id: r, name: r }]))
  return {
    id,
    roles: {
      cache,
      add: vi.fn(async (role: FakeRole) => {
        cache.set(role.id, role)
      }),
      remove: vi.fn(async (role: FakeRole) => {
        cache.delete(role.id)
      }),
    },
  }
}

function makeConfig(roles: { employee?: string; manager?: string; owner?: string }) {
  const entry = (roleId?: string) =>
    roleId ? { mappingId: `m-${roleId}`, roleId, roleName: roleId, label: roleId } : null
  return {
    businessId: 'biz-1',
    slug: 'original-clothing',
    name: 'OC',
    providerType: 'discord-only',
    roles: {
      employee: entry(roles.employee),
      manager: entry(roles.manager),
      owner: entry(roles.owner),
      custom: [],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: true,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
      allowOwnerRoleFallback: false,
    },
  }
}

function setup(memberRoles: string[], guildRoles: string[], userId = USER) {
  const member = makeMember(userId, memberRoles)
  const guild = {
    id: GUILD,
    roles: { cache: new RoleCache<FakeRole>(guildRoles.map((r) => [r, safeRole(r)])) },
    members: { fetch: vi.fn(async () => member), me: { roles: { highest: { position: 100 } } } },
  }
  ;(member as unknown as { guild: unknown }).guild = guild
  const client = { guilds: { cache: new Map([[GUILD, guild]]) }, user: { id: BOT_ID } }
  return { member, guild, ctx: { client, requestId: 'r1', ts: Date.now() } }
}

function call(verb: string, params: unknown, ctx: unknown) {
  return handlers.get(verb)!(params, ctx) as Promise<{ ok: boolean; error?: string; data?: unknown; details?: unknown }>
}

beforeEach(() => {
  vi.clearAllMocks()
  state.bizRows = [
    { id: 'biz-1', slug: 'original-clothing', providerType: 'discord-only', guildId: GUILD, active: true },
  ]
  state.dbOwner = false
  state.config = makeConfig({ employee: 'emp', manager: 'mgr', owner: 'own' })
})

describe('employee.* RPC guards', () => {
  it('refuses McKenzie businesses', async () => {
    state.bizRows = [{ id: 'biz-m', slug: 'mckenzie', providerType: 'mckenzie', guildId: GUILD, active: true }]
    const { ctx, member } = setup([], ['emp'])
    for (const verb of ['employee.hire', 'employee.fire', 'employee.promote', 'employee.demote']) {
      const res = await call(verb, { businessSlug: 'mckenzie', userId: USER, rank: 'employee' }, ctx)
      expect(res).toEqual({ ok: false, error: 'mke-not-supported' })
    }
    expect(member.roles.add).not.toHaveBeenCalled()
  })

  it('refuses the bot itself and BOT_OWNER_ID as targets', async () => {
    for (const target of [BOT_ID, BOT_OWNER]) {
      const { ctx, member } = setup(['emp'], ['emp', 'mgr'], target)
      for (const verb of ['employee.hire', 'employee.fire', 'employee.promote', 'employee.demote']) {
        const res = await call(verb, { businessSlug: 'original-clothing', userId: target, rank: 'employee' }, ctx)
        expect(res).toEqual({ ok: false, error: 'protected-target' })
      }
      expect(member.roles.add).not.toHaveBeenCalled()
      expect(member.roles.remove).not.toHaveBeenCalled()
    }
  })

  it('still allows an owner grant and audits it once', async () => {
    const { ctx, member } = setup([], ['emp', 'mgr', 'own'])
    const res = await call('employee.hire', { businessSlug: 'original-clothing', userId: USER, rank: 'owner' }, ctx)
    expect(res.ok).toBe(true)
    expect(member.roles.cache.has('own')).toBe(true)
    expect(audit).toHaveBeenCalledTimes(1)
    expect(vi.mocked(audit).mock.calls[0][0]).toMatchObject({
      actorDiscordId: 'botpanel',
      action: 'rpc.employee.hire',
      targetType: 'discord_user',
      targetId: USER,
      success: true,
    })
  })

  it('audits a failed mutation and returns a generic error code', async () => {
    // Manager role mapped but missing from the guild -> RoleMissingError.
    const { ctx } = setup(['emp'], ['emp'])
    const res = await call('employee.promote', { businessSlug: 'original-clothing', userId: USER }, ctx)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('role-missing')
    expect(JSON.stringify(res)).not.toContain('Role not found in server')
    expect(audit).toHaveBeenCalledTimes(1)
    expect(vi.mocked(audit).mock.calls[0][0]).toMatchObject({ action: 'rpc.employee.promote', success: false })
  })

  it('does not audit pure param-validation failures', async () => {
    const { ctx } = setup([], ['emp'])
    const res = await call('employee.hire', { businessSlug: 'original-clothing', userId: USER, rank: 'boss' }, ctx)
    expect(res).toEqual({ ok: false, error: 'invalid-rank' })
    expect(audit).not.toHaveBeenCalled()
  })
})

describe('employee.demote of a DB-only owner (C14)', () => {
  it('removes the business_owners row without throwing when no owner role is mapped', async () => {
    state.config = makeConfig({ employee: 'emp', manager: 'mgr' })
    state.dbOwner = true
    const { ctx, member } = setup([], ['emp', 'mgr'])
    const res = await call('employee.demote', { businessSlug: 'original-clothing', userId: USER }, ctx)
    expect(res).toEqual({ ok: true, data: { before: 'owner', after: 'manager' } })
    expect(removeBusinessOwner).toHaveBeenCalledWith('biz-1', USER)
    expect(member.roles.cache.has('mgr')).toBe(true)
    expect(member.roles.cache.has('emp')).toBe(true)
  })
})
