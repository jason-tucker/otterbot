/**
 * `meta.*` RPC verbs for otter — mirror of squishybot's meta verbs.
 *
 * Otter is in a single guild today (managed via businesses), so we read
 * from `client.guilds.cache.first()`. If otter ever joins multiple
 * guilds we'd add `?guildId=` plumbing here.
 *
 *  - `meta.list_roles` — `{}` → `{ roles: [...] }`. Sorted position desc.
 *  - `meta.list_channels` — `{ types?: Type[] }` → `{ channels: [...] }`.
 *  - `meta.list_members` — `{ query?, limit? }` → `{ members: [...] }`.
 *
 * Pure cache reads — zero Discord API hits. Behavior identical to
 * squishy's variants so `<RolePicker>` / `<ChannelPicker>` /
 * `<MemberPicker>` can target `bot="otter"` with the same response
 * shapes.
 */
import { ChannelType, type GuildBasedChannel } from 'discord.js'
import { registerVerb, type VerbHandler } from '../registry'

type ChannelTypeToken = 'text' | 'voice' | 'category' | 'forum' | 'announcement'

const CHANNEL_TYPE_MAP: Record<ChannelTypeToken, ChannelType[]> = {
  text: [ChannelType.GuildText],
  voice: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
  category: [ChannelType.GuildCategory],
  forum: [ChannelType.GuildForum],
  announcement: [ChannelType.GuildAnnouncement],
}

function tokenForType(t: ChannelType): ChannelTypeToken | 'other' {
  switch (t) {
    case ChannelType.GuildText:
      return 'text'
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return 'voice'
    case ChannelType.GuildCategory:
      return 'category'
    case ChannelType.GuildForum:
      return 'forum'
    case ChannelType.GuildAnnouncement:
      return 'announcement'
    default:
      return 'other'
  }
}

const listRolesHandler: VerbHandler = async (_params, ctx) => {
  const guild = ctx.client.guilds.cache.first()
  if (!guild) return { ok: false, error: 'guild-not-cached' }
  const roles = guild.roles.cache
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      managed: r.managed,
      hoisted: r.hoist,
      mentionable: r.mentionable,
    }))
    .sort((a, b) => b.position - a.position)
  return { ok: true, data: { roles } }
}

type ListChannelsParams = { types?: unknown }

const listChannelsHandler: VerbHandler = async (rawParams, ctx) => {
  const guild = ctx.client.guilds.cache.first()
  if (!guild) return { ok: false, error: 'guild-not-cached' }

  const params = (rawParams ?? {}) as ListChannelsParams
  let acceptedTypes: ChannelType[] | null = null
  if (Array.isArray(params.types) && params.types.length > 0) {
    const tokens = params.types.filter((t): t is ChannelTypeToken =>
      typeof t === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_TYPE_MAP, t),
    )
    acceptedTypes = tokens.flatMap((t) => CHANNEL_TYPE_MAP[t])
  }

  const rows = guild.channels.cache
    .filter((c): c is GuildBasedChannel => {
      if (!acceptedTypes) return true
      return acceptedTypes.includes(c.type)
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: tokenForType(c.type),
      parentId: 'parentId' in c ? (c.parentId as string | null) ?? null : null,
      position: 'position' in c ? ((c as { position?: number }).position ?? 0) : 0,
    }))
    .sort((a, b) => {
      const pa = a.parentId ?? ''
      const pb = b.parentId ?? ''
      if (pa < pb) return -1
      if (pa > pb) return 1
      return a.position - b.position
    })

  return { ok: true, data: { channels: rows } }
}

type ListMembersParams = { query?: unknown; limit?: unknown }

const listMembersHandler: VerbHandler = async (rawParams, ctx) => {
  const guild = ctx.client.guilds.cache.first()
  if (!guild) return { ok: false, error: 'guild-not-cached' }

  const params = (rawParams ?? {}) as ListMembersParams
  const query = typeof params.query === 'string' ? params.query.trim().toLowerCase() : ''
  let limit = typeof params.limit === 'number' ? params.limit : 25
  if (!Number.isFinite(limit) || limit < 1) limit = 25
  if (limit > 100) limit = 100

  const all = guild.members.cache
  const matches: { id: string; username: string; displayName: string; avatarUrl: string }[] = []
  for (const m of all.values()) {
    if (query) {
      const u = m.user.username.toLowerCase()
      const d = (m.displayName ?? '').toLowerCase()
      if (!u.includes(query) && !d.includes(query)) continue
    }
    matches.push({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName ?? m.user.username,
      avatarUrl: m.displayAvatarURL({ size: 64 }),
    })
    if (matches.length >= limit) break
  }
  return { ok: true, data: { members: matches } }
}

registerVerb('meta.list_roles', listRolesHandler)
registerVerb('meta.list_channels', listChannelsHandler)
registerVerb('meta.list_members', listMembersHandler)
