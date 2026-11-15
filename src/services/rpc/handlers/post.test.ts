import { describe, it, expect, vi, beforeEach } from 'vitest'

const GUILD = '100000000000000001'
const OTHER_GUILD = '100000000000000009'
const CHANNEL = '300000000000000001'

const state = vi.hoisted(() => ({
  bizRows: [] as Array<Record<string, unknown>>,
}))

const handlers = vi.hoisted(() => new Map<string, (p: unknown, ctx: unknown) => Promise<unknown>>())

vi.mock('../registry', () => ({
  registerVerb: (n: string, h: (p: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(n, h),
}))
vi.mock('../../../config/env', () => ({ env: { sudoRoleIds: [] } }))
vi.mock('../../../db/client', () => {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = async () => state.bizRows
  return { db: { select: () => chain } }
})
vi.mock('../../auditService', () => ({ audit: vi.fn(async () => undefined) }))
vi.mock('../../ocStockService', () => ({ getAllStock: vi.fn(async () => []) }))
vi.mock('../../../embeds/ocEmbed', () => ({ buildOCPublicContainer: vi.fn(() => ({ kind: 'oc' })) }))
vi.mock('../../cakedRenderers', () => ({
  cakedContactInfoContainer: vi.fn(() => ({ kind: 'contact' })),
  cakedEventInfoContainer: vi.fn(() => ({ kind: 'event' })),
  cakedPricingContainer: vi.fn(() => ({ kind: 'pricing' })),
  cakedAnnouncementContainer: vi.fn(() => ({ kind: 'announcement' })),
}))
vi.mock('../../businessMessagesService', () => ({
  CAKED_EDITABLE_KEYS: ['caked.contact'],
  getBusinessMessageOverrides: vi.fn(async () => ({})),
  resolveBusinessIdBySlug: vi.fn(async () => 'biz-1'),
}))

import { getBusinessMessageOverrides } from '../../businessMessagesService'
import './oc'
import './caked'

type FakeChannel = {
  guildId?: string | null
  isTextBased: () => boolean
  send: ReturnType<typeof vi.fn>
}

function makeChannel(guildId: string | null | undefined): FakeChannel {
  const ch: FakeChannel = {
    isTextBased: () => true,
    send: vi.fn(async () => ({ id: '400000000000000001' })),
  }
  if (guildId !== undefined) ch.guildId = guildId
  return ch
}

function ctxFor(channel: FakeChannel) {
  return {
    client: { channels: { fetch: vi.fn(async () => channel) } },
    requestId: 'r1',
    ts: Date.now(),
  }
}

const VERBS: Array<[string, Record<string, unknown>]> = [
  ['oc.stock_post', { channelId: CHANNEL }],
  ['caked.message_post', { channelId: CHANNEL, kind: 'pricing' }],
]

beforeEach(() => {
  vi.clearAllMocks()
  state.bizRows = [{ id: 'biz-1', guildId: GUILD, active: true }]
})

describe.each(VERBS)('%s channel guard', (verb, params) => {
  it('posts to a channel in the business guild', async () => {
    const ch = makeChannel(GUILD)
    const res = (await handlers.get(verb)!(params, ctxFor(ch))) as { ok: boolean }
    expect(res.ok).toBe(true)
    expect(ch.send).toHaveBeenCalledTimes(1)
  })

  it('refuses a channel in a foreign guild', async () => {
    const ch = makeChannel(OTHER_GUILD)
    expect(await handlers.get(verb)!(params, ctxFor(ch))).toEqual({ ok: false, error: 'channel-not-allowed' })
    expect(ch.send).not.toHaveBeenCalled()
  })

  it('refuses a DM channel', async () => {
    for (const ch of [makeChannel(undefined), makeChannel(null)]) {
      expect(await handlers.get(verb)!(params, ctxFor(ch))).toEqual({ ok: false, error: 'channel-not-allowed' })
      expect(ch.send).not.toHaveBeenCalled()
    }
  })

  it('refuses when the business is inactive or missing', async () => {
    const ch = makeChannel(GUILD)
    state.bizRows = [{ id: 'biz-1', guildId: GUILD, active: false }]
    expect(await handlers.get(verb)!(params, ctxFor(ch))).toEqual({ ok: false, error: 'business-inactive' })
    state.bizRows = []
    expect(await handlers.get(verb)!(params, ctxFor(ch))).toEqual({ ok: false, error: 'business-not-found' })
    expect(ch.send).not.toHaveBeenCalled()
  })

  it('returns send-failed without the Discord error text', async () => {
    const ch = makeChannel(GUILD)
    ch.send.mockRejectedValueOnce(new Error('Missing Access token=abc'))
    expect(await handlers.get(verb)!(params, ctxFor(ch))).toEqual({ ok: false, error: 'send-failed' })
  })
})

describe('caked.message_post overrides', () => {
  it('loads overrides for the resolved business id', async () => {
    const ch = makeChannel(GUILD)
    await handlers.get('caked.message_post')!({ channelId: CHANNEL, kind: 'contact' }, ctxFor(ch))
    expect(getBusinessMessageOverrides).toHaveBeenCalledWith('biz-1', ['caked.contact'])
  })
})
