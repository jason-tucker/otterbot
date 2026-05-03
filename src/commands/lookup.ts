import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { getProvider } from '../services/businessService'
import { buildCustomerEmbed } from '../embeds/customerEmbed'
import { audit } from '../services/auditService'
import { db } from '../db/client'
import { standings, notes } from '../db/schema'
import { and, eq, count } from 'drizzle-orm'
import type { ResolvedBusiness, Character } from '../types/domain'
import { storeLookupSession } from '../services/interactionCache'

// Both slash command and select menu interactions support editReply after deferring
export type LookupInteraction = ChatInputCommandInteraction | StringSelectMenuInteraction

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

  if (resolved.length === 0) {
    await interaction.editReply('You are not registered as staff for any business.')
    return
  }

  const targetUser = interaction.options.getUser('user', true)

  if (resolved.length === 1) {
    await runLookup(interaction, resolved[0], targetUser.id, targetUser.username)
    return
  }

  // Multiple businesses — show selector
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lookup_business_select:${targetUser.id}`)
    .setPlaceholder('Which business are you acting as?')
    .addOptions(
      resolved.map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.business.name)
          .setDescription(`Acting as ${r.rank}`)
          .setValue(r.business.id)
      )
    )

  await interaction.editReply({
    content: 'You belong to multiple businesses. Which are you acting as?',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}

export async function runLookup(
  interaction: LookupInteraction,
  resolved: ResolvedBusiness,
  targetDiscordId: string,
  targetUsername: string
): Promise<void> {
  const { business, rank } = resolved
  const provider = getProvider(business)

  let characters: Character[]
  try {
    characters = await provider.lookupByDiscordId(targetDiscordId)
  } catch (err) {
    console.error('Provider lookup error:', err)
    await interaction.editReply({
      content: `Could not reach the ${business.name} API. Try again in a moment.`,
      components: [],
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
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setDescription(`No characters found for **${targetUsername}** in ${business.name}.`),
      ],
      components: [],
    })
    return
  }

  if (characters.length === 1) {
    await showCharacterEmbed(interaction, resolved, characters[0], targetDiscordId)
    return
  }

  // Multiple characters — let staff pick one
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lookup_char_select:${business.id}:${targetDiscordId}`)
    .setPlaceholder('Select a character')
    .addOptions(
      characters.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setDescription(c.csn ? `CSN: ${c.csn}` : 'No CSN on record')
          .setValue(c.id)
      )
    )

  await interaction.editReply({
    content: `Found ${characters.length} characters linked to **${targetUsername}**. Which one?`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    embeds: [],
  })
}

export async function showCharacterEmbed(
  interaction: LookupInteraction,
  resolved: ResolvedBusiness,
  character: Character,
  targetDiscordId: string
): Promise<void> {
  const { business, rank } = resolved

  const [standingRow, notesCountRow] = await Promise.all([
    db
      .select()
      .from(standings)
      .where(and(eq(standings.businessId, business.id), eq(standings.characterId, character.id)))
      .limit(1),
    db
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.businessId, business.id), eq(notes.characterId, character.id))),
  ])

  const standing = standingRow[0] ?? null
  const notesCount = notesCountRow[0]?.value ?? 0

  const standingTyped = standing
    ? {
        id: standing.id,
        businessId: standing.businessId,
        characterId: standing.characterId,
        characterName: standing.characterName,
        standing: standing.standing as import('../types/domain').Standing,
        reason: standing.reason ?? null,
        updatedByDiscordId: standing.updatedByDiscordId,
        updatedAt: standing.updatedAt,
      }
    : null

  const sessionKey = storeLookupSession({
    characterId: character.id,
    characterName: character.name,
    businessId: business.id,
    targetDiscordId,
    rank,
  })

  const response = buildCustomerEmbed(character, business, standingTyped, rank, targetDiscordId, Number(notesCount), sessionKey)
  await interaction.editReply({ ...response, components: response.components })
}
