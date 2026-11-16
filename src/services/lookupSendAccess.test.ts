import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ resolved: [] as unknown[], sudo: false }))
vi.mock('../config/env', () => ({ env: { sudoRoleIds: [] } }))
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('./permissionService', () => ({ resolveBusinesses: vi.fn(async () => h.resolved) }))
vi.mock('./sudoService', () => ({ isSudoUser: vi.fn(() => h.sudo) }))

import { lookupSendAuthorizer } from './lookupSendAccess'
import { buildCustomerEmbed } from '../embeds/customerEmbed'
import { handleSendToChannel } from '../utils/sendable'

const mke = { business: { providerType: 'mckenzie' }, rank: 'employee' }
const other = { business: { providerType: 'discord-only' }, rank: 'manager' }

type FakeButton = {
  customId: string
  user: { id: string }
  guild: unknown
  reply: ReturnType<typeof vi.fn>
  deferUpdate: ReturnType<typeof vi.fn>
  followUp: ReturnType<typeof vi.fn>
}

function btn(userId: string, customId = 'send_to_channel:x'): FakeButton {
  return {
    customId,
    user: { id: userId },
    guild: { members: { fetch: vi.fn(async () => ({ id: userId })) } },
    reply: vi.fn(async () => undefined),
    deferUpdate: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  }
}

describe('lookupSendAuthorizer', () => {
  beforeEach(() => {
    h.resolved = [mke]
    h.sudo = false
  })

  it('allows the original viewer while still McKenzie staff', async () => {
    expect(await lookupSendAuthorizer('u1')(btn('u1') as never)).toBe(true)
  })
  it('allows the original viewer while sudo', async () => {
    h.resolved = []
    h.sudo = true
    expect(await lookupSendAuthorizer('u1')(btn('u1') as never)).toBe(true)
  })
  it('refuses a demoted viewer (no longer McKenzie staff, not sudo)', async () => {
    h.resolved = [other]
    expect(await lookupSendAuthorizer('u1')(btn('u1') as never)).toBe(false)
  })
  it('refuses anyone but the original viewer', async () => {
    expect(await lookupSendAuthorizer('u1')(btn('u2') as never)).toBe(false)
  })
})

describe('customer card Send to Channel', () => {
  const character = { id: 'c', name: 'N', csn: '1', dob: null, phoneNumber: '5', bankNumber: '6' } as never
  const business = { id: 'b', name: 'MKE' } as never

  it('posts nothing when the authorize hook refuses or throws, and posts when allowed', async () => {
    const make = (key: string, authorize?: () => Promise<boolean>, mode: 'staff' | 'self' = 'staff') =>
      buildCustomerEmbed(character, business, null, 'employee', null, 0, key, mode, undefined, authorize)
    make('refused', async () => false)
    make('throws', async () => {
      throw new Error('boom')
    })
    make('allowed', async () => true)
    make('self', undefined, 'self')

    const refused = btn('u1', 'send_to_channel:lookup:refused')
    await handleSendToChannel(refused as never)
    expect(refused.followUp).not.toHaveBeenCalled()
    expect(refused.reply).toHaveBeenCalled()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const throws = btn('u1', 'send_to_channel:lookup:throws')
    await handleSendToChannel(throws as never)
    expect(throws.followUp).not.toHaveBeenCalled()
    expect(throws.reply).toHaveBeenCalled()

    const allowed = btn('u1', 'send_to_channel:lookup:allowed')
    await handleSendToChannel(allowed as never)
    expect(allowed.followUp).toHaveBeenCalledTimes(1)

    // 'self' lookups carry no authorize hook.
    const self = btn('u1', 'send_to_channel:lookup:self')
    await handleSendToChannel(self as never)
    expect(self.followUp).toHaveBeenCalledTimes(1)
  })
})
