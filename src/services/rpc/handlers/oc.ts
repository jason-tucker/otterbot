/**
 * OC stock RPC verbs — exposes the same Components V2 stock card that the
 * `/oc` slash command's "Send to Channel" button posts, but driven by the
 * panel instead of a Discord interaction.
 *
 * Reuses `buildOCPublicContainer` from `embeds/ocEmbed.ts` (already the
 * single source of truth for the slash command) so the panel-posted card
 * and the bot-posted card never diverge.
 *
 * Registers itself at module load — `rpcServer.ts` does a side-effect
 * import to trigger registration.
 */

import { MessageFlags, type Channel } from 'discord.js'
import { registerVerb } from '../registry'
import { getAllStock } from '../../ocStockService'
import { buildOCPublicContainer } from '../../../embeds/ocEmbed'
import { parseSnowflake } from '../../../utils/validators'

interface StockPostParams {
  channelId: string
}

function parseParams(input: unknown): StockPostParams | null {
  if (!input || typeof input !== 'object') return null
  const channelId = parseSnowflake((input as Record<string, unknown>).channelId)
  if (!channelId) return null
  return { channelId }
}

registerVerb('oc.stock_post', async (params, ctx) => {
  const parsed = parseParams(params)
  if (!parsed) {
    return { ok: false, error: 'invalid-params' }
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
  // that can `.send`. Stage / category / forum-root channels short-circuit
  // here.
  if (!('isTextBased' in channel) || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return { ok: false, error: 'not-text-based' }
  }

  const items = await getAllStock()
  const container = buildOCPublicContainer(items)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendable = channel as any
    const msg = await sendable.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
    })
    return {
      ok: true,
      data: { messageId: msg.id, channelId: parsed.channelId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
})
