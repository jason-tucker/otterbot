import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolved: [] as any[],
  sudo: false,
  roster: null as any,
  storeSession: vi.fn(() => 'sess-1'),
  audit: vi.fn(),
}))

vi.mock('../services/permissionService', () => ({ resolveBusinesses: async () => h.resolved }))
vi.mock('../services/sudoService', () => ({ isSudoUser: () => h.sudo }))
vi.mock('../services/providers/MckenzieProvider', () => ({
  MckenzieProvider: { findByName: async () => h.roster },
}))
vi.mock('../services/auditService', () => ({ audit: h.audit, auditSafe: h.audit }))
vi.mock('../services/interactionCache', () => ({ storeBusinessRosterSession: h.storeSession }))
vi.mock('../utils/panelLink', () => ({ panelLinkDisplay: () => ({ toJSON: () => ({}) }) }))

import { execute } from './business'
import { handleSendToChannel } from '../utils/sendable'
import { resetBusinessCooldownsForTest } from '../services/rosterAccess'

function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, acc))
  return acc
}

function render(reply: any): string {
  return collectStrings(
    (reply.components as any[]).map((c) => (typeof c?.toJSON === 'function' ? c.toJSON() : c)),
  ).join('\n')
}

function makeInteraction(userId = 'u1') {
  return {
    inGuild: () => true,
    guild: { id: 'g1', members: { fetch: vi.fn(async () => ({ id: userId, roles: { cache: new Map() } })) } },
    guildId: 'g1',
    user: { id: userId, username: 'tester' },
    options: { getString: () => 'Acme Corp' },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as any
}

const biz = (name: string, providerType = 'discord-only') => ({
  id: `id-${name}`,
  name,
  slug: name.toLowerCase(),
  providerType,
  settings: {},
})

beforeEach(() => {
  resetBusinessCooldownsForTest()
  h.storeSession.mockClear()
  h.audit.mockReset()
  h.sudo = false
  h.resolved = [{ business: biz('Other Shop'), rank: 'owner' }]
  h.roster = {
    businessName: 'Acme Corp',
    ownerName: 'Olive',
    members: [
      { id: 'm0', name: 'Olive', csn: '111', role: 'owner', discordId: '999', character: { phoneNumber: '555-0100', bankNumber: 'BANK-1' } },
      { id: 'm1', name: 'Eddie', csn: '222', role: 'employee', discordId: null, character: { phoneNumber: '555-0200', bankNumber: 'BANK-2' } },
    ],
  }
})

async function run(userId = 'u1') {
  const i = makeInteraction(userId)
  await execute(i)
  expect(i.editReply).toHaveBeenCalledTimes(1)
  const reply = i.editReply.mock.calls[0][0]
  return { i, reply, text: render(reply) }
}

function expectFull(text: string) {
  expect(text).toContain('Eddie')
  expect(text).toContain('222')
  expect(text).toContain('555-0200')
  expect(text).toContain('BANK-2')
  expect(text).toContain('send_to_channel:')
  expect(text).toContain('business_lookup:sess-1')
}

describe('/business roster redaction', () => {
  it('gives an unrelated non-McKenzie staffer a names-only card with no send or lookup buttons', async () => {
    const { reply, text } = await run()
    expect(text).toContain('Olive')
    expect(text).toContain('Eddie')
    for (const pii of ['111', '222', '555-0100', '555-0200', 'BANK-1', 'BANK-2', '<@999>']) {
      expect(text).not.toContain(pii)
    }
    expect(text).not.toContain('send_to_channel:')
    expect(text).not.toContain('business_lookup:')
    expect(h.storeSession).not.toHaveBeenCalled()
    expect(reply.content).toBeNull()
  })

  it('gives staff of the searched business the full card', async () => {
    h.resolved = [{ business: biz('Acme Corp'), rank: 'employee' }]
    expectFull((await run()).text)
  })

  it('gives McKenzie staff the full card', async () => {
    h.resolved = [{ business: biz('McKenzie Enterprises', 'mckenzie'), rank: 'employee' }]
    expectFull((await run()).text)
  })

  it('gives sudo with no business the full card', async () => {
    h.resolved = []
    h.sudo = true
    expectFull((await run()).text)
  })

  it('re-checks access when Send to Channel is clicked', async () => {
    h.resolved = [{ business: biz('Acme Corp'), rank: 'employee' }]
    const { text } = await run()
    const key = /send_to_channel:(business:[0-9a-f-]+)/.exec(text)![1]

    const click = (userId: string) => ({
      customId: `send_to_channel:${key}`,
      guild: { id: 'g1', members: { fetch: vi.fn(async () => ({ id: userId, roles: { cache: new Map() } })) } },
      user: { id: userId },
      reply: vi.fn(),
      deferUpdate: vi.fn(),
      followUp: vi.fn(),
    }) as any

    // Staff role removed since the search: refused, nothing posted.
    h.resolved = [{ business: biz('Other Shop'), rank: 'owner' }]
    const denied = click('u1')
    await handleSendToChannel(denied)
    expect(denied.followUp).not.toHaveBeenCalled()
    expect(denied.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }))

    // Another user can never post it.
    h.resolved = [{ business: biz('Acme Corp'), rank: 'employee' }]
    const other = click('u2')
    await handleSendToChannel(other)
    expect(other.followUp).not.toHaveBeenCalled()

    // Still staff of the business: posted.
    const ok = click('u1')
    await handleSendToChannel(ok)
    expect(ok.followUp).toHaveBeenCalledTimes(1)
  })
})
