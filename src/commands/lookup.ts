import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { getProvider } from '../services/businessService'
import { buildCustomerEmbed, type ViewerMode } from '../embeds/customerEmbed'
import { audit } from '../services/auditService'
import { db } from '../db/client'
import { notes, businesses } from '../db/schema'
import { and, eq, count } from 'drizzle-orm'
import type { ResolvedBusiness, Character, Business } from '../types/domain'
import { storeLookupSession } from '../services/interactionCache'
import { refreshKnownMckenzieBusinesses, type KnownBusiness } from '../services/mckenzieBusinessCache'

// All three interaction types support deferReply / editReply after deferring
export type LookupInteraction =
  | ChatInputCommandInteraction
  | StringSelectMenuInteraction
  | UserContextMenuCommandInteraction

export const data = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription('Look up a customer or character')
  .setDMPermission(false)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Discord user to look up').setRequired(true)
  )

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const mckenzie = resolved.find((r) => r.business.providerType === 'mckenzie')

  const targetUser = interaction.options.getUser('user', true)

  if (mckenzie) {
    await runLookup(interaction, mckenzie, targetUser.id, targetUser.username)
    return
  }

  // Non-staff: only allowed to look up themselves.
  if (targetUser.id !== interaction.user.id) {
    await interaction.editReply('You must be McKenzie Enterprises staff to look up other users. You can run this on yourself, though.')
    return
  }

  const mckenzieBusiness = await fetchMckenzieBusiness(interaction.guild.id)
  if (!mckenzieBusiness) {
    await interaction.editReply('McKenzie Enterprises is not configured for this server.')
    return
  }

  const synthetic: ResolvedBusiness = { business: mckenzieBusiness, rank: 'employee' }
  await runLookup(interaction, synthetic, targetUser.id, targetUser.username, 'self')
}

async function fetchMckenzieBusiness(guildId: string): Promise<Business | null> {
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(
      eq(businesses.providerType, 'mckenzie'),
      eq(businesses.guildId, guildId),
      eq(businesses.active, true),
    ))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType,
    guildId: row.guildId,
    active: row.active,
    settings: row.settings ?? null,
    createdAt: row.createdAt,
  }
}

export async function runLookup(
  interaction: LookupInteraction,
  resolved: ResolvedBusiness,
  targetDiscordId: string,
  targetUsername: string,
  viewerMode: ViewerMode = 'staff',
): Promise<void> {
  const { business, rank } = resolved
  const provider = getProvider(business)

  let characters: Character[]
  try {
    characters = await provider.lookupByDiscordId(targetDiscordId)
  } catch (err) {
    console.error('Provider lookup error:', err)
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Could not reach the ${business.name} API. Try again in a moment.`)
        ),
      ] as any[],
    })
    return
  }

  await audit({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: business.id,
    action: 'lookup',
    targetType: 'discord_user',
    targetId: targetDiscordId,
    success: characters.length > 0,
    details: { found: characters.length },
  })

  if (characters.length === 0) {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`No characters found for **${targetUsername}** in ${business.name}.`)
        ),
      ] as any[],
    })
    return
  }

  if (characters.length === 1) {
    await showCharacterEmbed(interaction, resolved, characters[0], targetDiscordId, viewerMode)
    return
  }

  // Multiple characters — let staff pick one
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lookup_char_select:${business.id}:${targetDiscordId}`)
    .setPlaceholder('Select a character')
    .addOptions(
      characters.map((c) => {
        const parts: string[] = []
        if (c.csn) parts.push(`CSN ${c.csn}`)
        if (c.phoneNumber) parts.push(`📞 ${c.phoneNumber}`)
        if (c.bankNumber) parts.push(`🏦 ${c.bankNumber}`)
        return new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setDescription(parts.join(' · ').slice(0, 100) || 'No info on record')
          .setValue(c.id)
      })
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`Found ${characters.length} characters linked to **${targetUsername}**. Which one?`)
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select),
    ] as any[],
  })
}

export async function showCharacterEmbed(
  interaction: LookupInteraction,
  resolved: ResolvedBusiness,
  character: Character,
  targetDiscordId: string | null,
  viewerMode: ViewerMode = 'staff',
): Promise<void> {
  const { business, rank } = resolved

  const provider = getProvider(business)

  const [notesCountRow, apiNotes, extendedProfile, knownBusinesses] = await Promise.all([
    db
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.businessId, business.id), eq(notes.characterId, character.id))),
    provider.getNotes && character.csn ? provider.getNotes(character.csn).catch(() => []) : Promise.resolve([]),
    provider.getCharacterByCsn && character.csn ? provider.getCharacterByCsn(character.csn).catch(() => null) : Promise.resolve(null),
    refreshKnownMckenzieBusinesses().catch(() => new Map<string, KnownBusiness>()),
  ])

  const businessAccountIds = extendedProfile?.businessAccountIds ?? []
  const matchedBusinesses: KnownBusiness[] = []
  const unknownBusinessIds: string[] = []
  for (const id of businessAccountIds) {
    const known = knownBusinesses.get(id)
    if (known) matchedBusinesses.push(known)
    else unknownBusinessIds.push(id)
  }

  // Count user-visible marker types (Note / Good Experience / Bad Experience).
  const { VISIBLE_MARKER_TYPES, MARKER_TYPE_GOOD, MARKER_TYPE_BAD } = await import('../services/providers/IBusinessProvider')
  const visibleApi = apiNotes
    .filter((n) => (VISIBLE_MARKER_TYPES as readonly number[]).includes(n.type))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
  const notesCount = Number(notesCountRow[0]?.value ?? 0) + visibleApi.length

  // Standing is now derived purely from the most-recent MKE Good/Bad Experience
  // marker (Change Standing was removed in 0.9.1 — see CHANGELOG). Latest bad → bad,
  // latest good → good, neither → neutral.
  const recentMarker = visibleApi.find(
    (n) => n.type === MARKER_TYPE_GOOD || n.type === MARKER_TYPE_BAD
  )
  const standingTyped: import('../types/domain').CustomerStanding | null = recentMarker
    ? {
        id: 'derived',
        businessId: business.id,
        characterId: character.id,
        characterName: character.name,
        standing: (recentMarker.type === MARKER_TYPE_BAD ? 'bad' : 'good') as import('../types/domain').Standing,
        reason: `Most recent MKE ${recentMarker.type === MARKER_TYPE_BAD ? 'Bad' : 'Good'} Experience`,
        updatedByDiscordId: 'system',
        updatedAt: new Date(recentMarker.created),
      }
    : null

  const sessionKey = await storeLookupSession({
    characterId: character.id,
    characterName: character.name,
    characterCsn: character.csn,
    businessId: business.id,
    targetDiscordId,
    rank,
  })

  const response = buildCustomerEmbed(character, business, standingTyped, rank, targetDiscordId, Number(notesCount), sessionKey, viewerMode, {
    matchedBusinesses,
    unknownBusinessCount: unknownBusinessIds.length,
  })
  await interaction.editReply({ ...response, content: null } as any)
}
