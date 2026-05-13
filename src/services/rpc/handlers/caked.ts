/**
 * Caked Up RPC verbs — exposes the Components V2 Caked cards (contact-info,
 * event-info, pricing) plus a free-form announcement card, posted to a
 * Discord channel from the panel.
 *
 * Renderers live in `services/cakedRenderers.ts` so the panel-posted card
 * stays bit-identical to what the `/caked` slash command and its button
 * handler render — single source of truth.
 *
 * Registers itself at module load — `rpcServer.ts` does a side-effect
 * import to trigger registration.
 */

import { MessageFlags, type Channel } from 'discord.js'
import { registerVerb } from '../registry'
import {
  cakedContactInfoContainer,
  cakedEventInfoContainer,
  cakedPricingContainer,
  cakedAnnouncementContainer,
} from '../../cakedRenderers'
import { parseSnowflake } from '../../../utils/validators'
import {
  CAKED_EDITABLE_KEYS,
  getBusinessMessageOverrides,
  resolveBusinessIdBySlug,
} from '../../businessMessagesService'

const KINDS = ['contact', 'event', 'pricing', 'announcement'] as const
type CakedKind = (typeof KINDS)[number]

interface CakedPostParams {
  channelId: string
  kind: CakedKind
  body?: string
}

const ANNOUNCEMENT_MAX = 2000

function parseParams(input: unknown): CakedPostParams | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'invalid-params' }
  const obj = input as Record<string, unknown>

  const channelId = parseSnowflake(obj.channelId)
  if (!channelId) return { error: 'invalid-channel-id' }

  const kindRaw = obj.kind
  if (typeof kindRaw !== 'string' || !(KINDS as readonly string[]).includes(kindRaw)) {
    return { error: 'invalid-kind' }
  }
  const kind = kindRaw as CakedKind

  if (kind === 'announcement') {
    const body = obj.body
    if (typeof body !== 'string' || body.trim().length === 0) {
      return { error: 'body-required' }
    }
    if (body.length > ANNOUNCEMENT_MAX) {
      return { error: 'body-too-long' }
    }
    return { channelId, kind, body }
  }

  // For non-announcement kinds we ignore any incoming body — the cards are
  // canned. Don't surface a misleading error if the panel sent one anyway.
  return { channelId, kind }
}

registerVerb('caked.message_post', async (params, ctx) => {
  const parsed = parseParams(params)
  if ('error' in parsed) {
    return { ok: false, error: parsed.error }
  }

  let channel: Channel | null = null
  try {
    channel = await ctx.client.channels.fetch(parsed.channelId)
  } catch {
    channel = null
  }

  if (!channel) {
    return { ok: false, error: 'channel-not-found' }
  }

  // `isTextBased()` covers DM, guild-text, news, thread, voice-text — anything
  // that can `.send`. Stage / category / forum-root short-circuit here.
  if (
    !('isTextBased' in channel) ||
    typeof channel.isTextBased !== 'function' ||
    !channel.isTextBased()
  ) {
    return { ok: false, error: 'not-text-based' }
  }

  // Pull the latest panel-edited overrides so a card posted from the panel
  // mirrors what the slash-command flow renders (single source of truth).
  // Announcements skip this — their body is per-call freeform text.
  let overrides: Record<string, string> = {}
  if (parsed.kind !== 'announcement') {
    const businessId = await resolveBusinessIdBySlug('caked-up')
    if (businessId) {
      overrides = await getBusinessMessageOverrides(businessId, CAKED_EDITABLE_KEYS)
    }
  }

  const container = (() => {
    switch (parsed.kind) {
      case 'contact':
        return cakedContactInfoContainer(overrides)
      case 'event':
        return cakedEventInfoContainer(overrides)
      case 'pricing':
        return cakedPricingContainer(overrides)
      case 'announcement':
        return cakedAnnouncementContainer(parsed.body!)
    }
  })()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendable = channel as any
    const msg = await sendable.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] },
    })
    return {
      ok: true,
      data: {
        messageId: msg.id,
        channelId: parsed.channelId,
        kind: parsed.kind,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
})
