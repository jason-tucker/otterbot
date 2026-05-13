/**
 * `discord.move_channel` — move a guild channel into a different category.
 *
 * Mirrors the `/movechannel` slash command (`src/commands/moveChannel.ts`).
 * Params: `{ channelId, categoryId, position: 'top'|'bottom' }`.
 *
 * Authorization: the panel route gates on "manager+ of at least one
 * business OR sudo". The bot doesn't re-derive that here — it trusts
 * the HMAC-protected RPC channel + panel-side gate, same as the rest of
 * the verbs in this directory.
 *
 * Behavior:
 *   1. Resolve the bot's guild and the target channel/category.
 *   2. Verify the bot has ManageChannels on the target channel.
 *   3. `setParent(categoryId, { lockPermissions: false })`. We don't lock
 *      perms so the channel's existing overwrites survive the move.
 *   4. If `position === 'top'`, set position to (first sibling's
 *      rawPosition). Otherwise leave at the bottom — `setParent` already
 *      places it there by default.
 *
 * Reply:
 *   `{ ok: true, data: { channelId, channelName, fromCategoryName,
 *                        toCategoryName, position } }`.
 *   `{ ok: false, error: 'channel-not-found'|'category-not-found'|
 *                        'not-a-category'|'missing-permissions'|
 *                        'discord-error' }`.
 */
import { ChannelType, PermissionFlagsBits, DiscordAPIError } from 'discord.js'
import type { CategoryChannel, GuildChannel } from 'discord.js'
import { registerVerb, type VerbHandler } from '../registry'

const SNOWFLAKE = /^\d{15,25}$/

type Position = 'top' | 'bottom'

interface Params {
  channelId: string
  categoryId: string
  position: Position
}

function parseParams(p: unknown): Params | { error: string } {
  if (!p || typeof p !== 'object') return { error: 'invalid-params' }
  const obj = p as Record<string, unknown>
  const channelId = obj.channelId
  const categoryId = obj.categoryId
  const position = obj.position
  if (typeof channelId !== 'string' || !SNOWFLAKE.test(channelId)) {
    return { error: 'invalid-channel-id' }
  }
  if (typeof categoryId !== 'string' || !SNOWFLAKE.test(categoryId)) {
    return { error: 'invalid-category-id' }
  }
  if (position !== 'top' && position !== 'bottom') {
    return { error: 'invalid-position' }
  }
  return { channelId, categoryId, position }
}

export const moveChannelHandler: VerbHandler = async (params, ctx) => {
  const parsed = parseParams(params)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const guild = ctx.client.guilds.cache.first()
  if (!guild) return { ok: false, error: 'guild-not-available' }

  const channel = await guild.channels.fetch(parsed.channelId).catch(() => null)
  if (!channel) return { ok: false, error: 'channel-not-found' }

  const category = await guild.channels.fetch(parsed.categoryId).catch(() => null)
  if (!category) return { ok: false, error: 'category-not-found' }
  if (category.type !== ChannelType.GuildCategory) {
    return { ok: false, error: 'not-a-category' }
  }

  const targetChannel = channel as GuildChannel
  const targetCategory = category as CategoryChannel

  const me = guild.members.me
  if (
    me &&
    !targetChannel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)
  ) {
    return { ok: false, error: 'missing-permissions' }
  }

  const fromCategoryName = targetChannel.parent?.name ?? null

  try {
    await targetChannel.setParent(targetCategory.id, { lockPermissions: false })

    if (parsed.position === 'top') {
      const siblings = targetCategory.children.cache
        .filter((c) => c.id !== targetChannel.id)
        .sort((a, b) => a.rawPosition - b.rawPosition)
      if (siblings.size > 0) {
        await targetChannel.setPosition(siblings.first()!.rawPosition)
      }
    }

    return {
      ok: true,
      data: {
        channelId: targetChannel.id,
        channelName: targetChannel.name,
        fromCategoryName,
        toCategoryName: targetCategory.name,
        position: parsed.position,
      },
    }
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === 50013) {
      return { ok: false, error: 'missing-permissions', details: err.message }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: 'discord-error', details: msg }
  }
}

registerVerb('discord.move_channel', moveChannelHandler)
