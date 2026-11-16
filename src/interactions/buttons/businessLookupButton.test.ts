import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  session: null as any,
  resolved: [] as any[],
  sudo: false,
}))

vi.mock('../../services/interactionCache', () => ({ getBusinessRosterSession: () => h.session }))
vi.mock('../../services/permissionService', () => ({ resolveBusinesses: async () => h.resolved }))
vi.mock('../../services/sudoService', () => ({ isSudoUser: () => h.sudo }))
vi.mock('../../utils/cmdMention', () => ({ cmd: (n: string) => `/${n}` }))
vi.mock('../../utils/cv2', () => ({ v2Text: (m: string) => ({ text: m }) }))

import { handleBusinessLookupButton } from './businessLookupButton'

const DENIED = { text: 'You do not have access to look up employees of this business.' }

function makeInteraction(userId = 'u1') {
  return {
    guild: { id: 'g1', members: { fetch: vi.fn(async () => ({ id: userId, roles: { cache: new Map() } })) } },
    guildId: 'g1',
    customId: 'business_lookup:key',
    user: { id: userId },
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
  } as any
}

const biz = (name: string, providerType = 'discord-only') => ({ id: `id-${name}`, name, slug: name, providerType, settings: {} })

beforeEach(() => {
  h.sudo = false
  h.session = {
    actorDiscordId: 'u1',
    roster: { businessName: 'Acme', members: [{ id: 'm1', name: 'M', csn: '123', role: 'employee', character: {} }] },
  }
})

describe('handleBusinessLookupButton', () => {
  it('denies a user who lost roster detail access since the search', async () => {
    h.resolved = [{ business: biz('Other'), rank: 'owner' }]
    const i = makeInteraction()
    await handleBusinessLookupButton(i)
    expect(i.editReply).toHaveBeenCalledWith(DENIED)
  })

  it('shows the employee select to staff of the searched business', async () => {
    h.resolved = [{ business: biz('Acme'), rank: 'employee' }]
    const i = makeInteraction()
    await handleBusinessLookupButton(i)
    expect(i.editReply).toHaveBeenCalledTimes(1)
    expect(i.editReply.mock.calls[0][0]).not.toEqual(DENIED)
  })
})
