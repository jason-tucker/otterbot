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
import { buildCustomerEmbed } from '../embeds/customerEmbed'
import { audit } from '../services/auditService'
import { db } from '../db/client'
import { standings, notes } from '../db/schema'
import { and, eq, count } from 'drizzle-orm'
import type { ResolvedBusiness, Character } from '../types/domain'
import { storeLookupSession } from '../services/interactionCache'

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

  if (!mckenzie) {
    await interaction.editReply('You are not registered as McKenzie Enterprises staff.')
    return
  }

  const targetUser = interaction.options.getUser('user', true)
  await runLookup(interaction, mckenzie, targetUser.id, targetUser.username)
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
  targetDiscordId: string | null
): Promise<void> {
  const { business, rank } = resolved

  const provider = getProvider(business)

  const [standingRow, notesCountRow, apiNotes] = await Promise.all([
    db
      .select()
      .from(standings)
      .where(and(eq(standings.businessId, business.id), eq(standings.characterId, character.id)))
      .limit(1),
    db
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.businessId, business.id), eq(notes.characterId, character.id))),
    provider.getNotes ? provider.getNotes(character.id).catch(() => []) : Promise.resolve([]),
  ])

  const standing = standingRow[0] ?? null
  const notesCount = Number(notesCountRow[0]?.value ?? 0) + apiNotes.length

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
  await interaction.editReply({ ...response, content: null } as any)
}
