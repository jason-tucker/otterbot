import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  session: null as any,
  resolved: [] as any[],
  showCharacterEmbed: vi.fn(),
  auditSafe: vi.fn(),
  sudo: false,
  allBiz: [] as any[],
}))

vi.mock('../../services/interactionCache', () => ({ getBusinessRosterSession: () => h.session }))
vi.mock('../../services/permissionService', () => ({ resolveBusinesses: async () => h.resolved }))
vi.mock('../../services/sudoService', () => ({ isSudoUser: () => h.sudo }))
vi.mock('../../services/portalService', () => ({ getAllBusinesses: async () => h.allBiz }))
vi.mock('../../services/auditService', () => ({ auditSafe: h.auditSafe }))
vi.mock('../../commands/lookup', () => ({ showCharacterEmbed: h.showCharacterEmbed }))
vi.mock('../../utils/cmdMention', () => ({ cmd: (n: string) => `/${n}` }))
vi.mock('../../utils/cv2', () => ({ v2Text: (m: string) => ({ text: m }) }))

import { handleBusinessEmployeeSelect } from './businessEmployeeSelect'

const DENIED = { text: 'You do not have access to look up employees of this business.' }

function makeInteraction(userId = 'u1') {
  return {
    inGuild: () => true,
    guild: { id: 'g1', members: { fetch: vi.fn(async () => ({ id: userId, roles: { cache: new Map() } })) } },
    guildId: 'g1',
    customId: 'business_employee_select:key',
    values: ['m1'],
    user: { id: userId, username: 'tester' },
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
  } as any
}

const biz = (name: string) => ({ id: `id-${name}`, name, slug: name, providerType: 'discord-only', settings: {} })

beforeEach(() => {
  h.showCharacterEmbed.mockReset()
  h.auditSafe.mockReset()
  h.sudo = false
  h.allBiz = []
  h.resolved = [{ business: biz('alpha'), rank: 'owner' }]
  h.session = {
    actorDiscordId: 'u1',
    roster: { businessName: 'Other Biz', members: [{ id: 'm1', name: 'M', character: { id: 'c1' } }] },
  }
})

describe('handleBusinessEmployeeSelect', () => {
  it('denies a user who did not run the search', async () => {
    const i = makeInteraction('intruder')
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed).not.toHaveBeenCalled()
    expect(h.auditSafe).not.toHaveBeenCalled()
    expect(i.followUp).toHaveBeenCalled()
  })

  it('denies a member who no longer has any staff role', async () => {
    h.resolved = []
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed).not.toHaveBeenCalled()
    expect(i.editReply).toHaveBeenCalledWith(DENIED)
  })

  it('denies staff of an unrelated business without auditing', async () => {
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed).not.toHaveBeenCalled()
    expect(h.auditSafe).not.toHaveBeenCalled()
    expect(i.editReply).toHaveBeenCalledWith(DENIED)
  })

  it('lets staff of the searched business view at their own rank and audits', async () => {
    h.session.roster.businessName = 'alpha'
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed).toHaveBeenCalledTimes(1)
    expect(h.showCharacterEmbed.mock.calls[0][1].rank).toBe('owner')
    expect(h.auditSafe.mock.calls[0][0]).toMatchObject({
      action: 'lookup',
      targetType: 'character',
      targetId: 'c1',
      actorDiscordId: 'u1',
    })
  })

  it('lets McKenzie staff view under McKenzie with their own rank', async () => {
    h.resolved = [{ business: { ...biz('mke'), providerType: 'mckenzie' }, rank: 'manager' }]
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed.mock.calls[0][1].rank).toBe('manager')
  })

  it('lets sudo with no business view under the McKenzie business at employee rank', async () => {
    h.resolved = []
    h.sudo = true
    h.allBiz = [{ ...biz('mke'), providerType: 'mckenzie', active: true, guildId: 'g1', createdAt: new Date(0) }]
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed).toHaveBeenCalledTimes(1)
    expect(h.showCharacterEmbed.mock.calls[0][1].business.id).toBe('id-mke')
    expect(h.showCharacterEmbed.mock.calls[0][1].rank).toBe('employee')
    expect(h.auditSafe).toHaveBeenCalledTimes(1)
  })

  it('keeps the McKenzie rank of a sudo user who is also McKenzie staff', async () => {
    h.sudo = true
    h.resolved = [{ business: { ...biz('mke'), providerType: 'mckenzie' }, rank: 'manager' }]
    h.allBiz = [{ ...biz('mke'), providerType: 'mckenzie', active: true, guildId: 'g1', createdAt: new Date(0) }]
    const i = makeInteraction()
    await handleBusinessEmployeeSelect(i)
    expect(h.showCharacterEmbed.mock.calls[0][1].rank).toBe('manager')
  })
})
