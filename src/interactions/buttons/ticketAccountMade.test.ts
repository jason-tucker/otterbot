import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ characters: [] as unknown[] }))
vi.mock('../../config/env', () => ({ env: {} }))
vi.mock('../../db/client', () => ({ db: {} }))
vi.mock('../../services/interactionCache', () => ({ storeLookupSession: vi.fn(async () => 'sess') }))
vi.mock('../../services/ticketLookup', () => ({
  fetchCharacters: vi.fn(async () => h.characters),
  getMckenzieBusinessId: vi.fn(async () => 'biz'),
}))
vi.mock('../../embeds/ticketCharacterEmbed', () => ({
  buildTicketCharacterEmbed: vi.fn(() => ({ components: ['card'], flags: 32768 })),
}))

import { handleTicketAccountMadeButton, handleTicketAccountHelpButton, findPublicTicketMessage } from './ticketAccountMade'

const TARGET = '300000000000000001'
const BOT = '900000000000000001'
const EPHEMERAL = 1 << 6

const characters = [{ id: 'c1', name: 'A', csn: '1', phoneNumber: null, bankNumber: null }]

function ticketMsg(id: string, ts: number, authorId = BOT, customId = `ticket_account_made:${TARGET}`) {
  return {
    id,
    createdTimestamp: ts,
    author: { id: authorId },
    // CV2 shape: container -> action row -> button
    components: [{ components: [{ components: [{ customId }] }] }],
    edit: vi.fn(async () => undefined),
  }
}

function makeInteraction(opts: {
  userId?: string
  customId?: string
  ephemeralClick?: boolean
  channelMessages?: ReturnType<typeof ticketMsg>[]
  manageChannels?: boolean
  channelId?: string
  clickedEdit?: ReturnType<typeof vi.fn>
}) {
  const userId = opts.userId ?? TARGET
  const clicked = {
    flags: { has: (f: number) => !!opts.ephemeralClick && f === EPHEMERAL },
    edit: opts.clickedEdit ?? vi.fn(async () => undefined),
  }
  const fetchMsgs = vi.fn(async () => new Map((opts.channelMessages ?? []).map((m) => [m.id, m])))
  const channel = {
    id: opts.channelId ?? `chan-${Math.random()}`,
    guildId: 'g1',
    messages: { fetch: fetchMsgs },
    send: vi.fn(async () => undefined),
  }
  return {
    clicked,
    channel,
    fetchMsgs,
    i: {
      customId: opts.customId ?? `ticket_account_made:${TARGET}`,
      user: { id: userId },
      client: { user: { id: BOT } },
      message: clicked,
      channel,
      guild: {
        members: {
          cache: new Map([[userId, { permissions: { has: () => !!opts.manageChannels } }]]),
          fetch: vi.fn(),
        },
      },
      reply: vi.fn(async () => undefined),
      deferReply: vi.fn(async () => undefined),
      editReply: vi.fn(async () => undefined),
    },
  }
}

beforeEach(() => {
  h.characters = characters
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('findPublicTicketMessage', () => {
  it('returns the clicked message when it is public (no history fetch)', async () => {
    const { i, clicked, fetchMsgs } = makeInteraction({})
    expect(await findPublicTicketMessage(i as never, TARGET)).toBe(clicked)
    expect(fetchMsgs).not.toHaveBeenCalled()
  })

  it('on an ephemeral click picks the newest bot message holding the Account Made button', async () => {
    const old = ticketMsg('old', 100)
    const newest = ticketMsg('new', 200)
    const foreign = ticketMsg('foreign', 300, '111')
    const otherUser = ticketMsg('other', 400, BOT, 'ticket_account_made:999')
    const { i } = makeInteraction({ ephemeralClick: true, channelMessages: [old, newest, foreign, otherUser] })
    expect(await findPublicTicketMessage(i as never, TARGET)).toBe(newest)
  })
})

describe('ticket_account_made button', () => {
  // The per-user 4-minute rate limit is module state, so each test uses its own ticket subject.
  it('Retry from the ephemeral edits the public ticket message and only then says updated', async () => {
    const t = 'subject-1'
    const pub = ticketMsg('pub', 200, BOT, `ticket_account_made:${t}`)
    const { i, clicked } = makeInteraction({ userId: t, customId: `ticket_account_made:${t}`, ephemeralClick: true, channelMessages: [pub] })
    await handleTicketAccountMadeButton(i as never)
    expect(pub.edit).toHaveBeenCalledTimes(1)
    expect(clicked.edit).not.toHaveBeenCalled()
    expect(i.editReply.mock.calls[0][0].content).toContain('updated the ticket message')
  })

  it('shows the card in the ephemeral and does not claim an update when no public message is found', async () => {
    const t = 'subject-2'
    const { i } = makeInteraction({ userId: t, customId: `ticket_account_made:${t}`, ephemeralClick: true, channelMessages: [] })
    await handleTicketAccountMadeButton(i as never)
    const arg = i.editReply.mock.calls[0][0]
    expect(arg.content).toBeUndefined()
    expect(arg.components).toEqual(['card'])
  })

  it('falls back to the ephemeral card when the public edit fails', async () => {
    const t = 'subject-3'
    const pub = ticketMsg('pub', 200, BOT, `ticket_account_made:${t}`)
    pub.edit.mockRejectedValue(new Error('Unknown Message'))
    const { i } = makeInteraction({ userId: t, customId: `ticket_account_made:${t}`, ephemeralClick: true, channelMessages: [pub] })
    await handleTicketAccountMadeButton(i as never)
    const arg = i.editReply.mock.calls[0][0]
    expect(arg.content).toBeUndefined()
    expect(arg.components).toEqual(['card'])
  })

  it('edits the clicked public message directly on the original Account Made click', async () => {
    const t = 'subject-4'
    const { i, clicked, fetchMsgs } = makeInteraction({ userId: t, customId: `ticket_account_made:${t}` })
    await handleTicketAccountMadeButton(i as never)
    expect(clicked.edit).toHaveBeenCalledTimes(1)
    expect(fetchMsgs).not.toHaveBeenCalled()
  })
})

describe('ticket_account_help button', () => {
  it('refuses a stranger without ManageChannels (ephemeral denial, no ping)', async () => {
    const { i, channel } = makeInteraction({ userId: 'stranger', customId: `ticket_account_help:${TARGET}`, channelId: 'help-1' })
    await handleTicketAccountHelpButton(i as never)
    expect(channel.send).not.toHaveBeenCalled()
    expect(i.reply.mock.calls[0][0]).toMatchObject({ ephemeral: true })
  })

  it('pings once per window per channel and refuses the repeat', async () => {
    const first = makeInteraction({ userId: TARGET, customId: `ticket_account_help:${TARGET}`, channelId: 'help-2' })
    await handleTicketAccountHelpButton(first.i as never)
    expect(first.channel.send).toHaveBeenCalledTimes(1)

    const again = makeInteraction({ userId: TARGET, customId: `ticket_account_help:${TARGET}`, channelId: 'help-2' })
    await handleTicketAccountHelpButton(again.i as never)
    expect(again.channel.send).not.toHaveBeenCalled()
    expect(again.i.reply.mock.calls[0][0]).toMatchObject({ ephemeral: true })

    // A different ticket channel is unaffected.
    const other = makeInteraction({ userId: TARGET, customId: `ticket_account_help:${TARGET}`, channelId: 'help-3' })
    await handleTicketAccountHelpButton(other.i as never)
    expect(other.channel.send).toHaveBeenCalledTimes(1)
  })

  it('lets ManageChannels staff ask for help', async () => {
    const { i, channel } = makeInteraction({ userId: 'staff', manageChannels: true, customId: `ticket_account_help:${TARGET}`, channelId: 'help-4' })
    await handleTicketAccountHelpButton(i as never)
    expect(channel.send).toHaveBeenCalledTimes(1)
  })
})
