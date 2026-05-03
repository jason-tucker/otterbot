import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type UserContextMenuCommandInteraction,
  type GuildMember,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { getEmployeeConfig } from '../config/employee-businesses.config'
import { buildEmployeeManageEmbed } from '../embeds/employeeManageEmbed'
import { storeEmployeeSession } from '../services/interactionCache'
import type { ResolvedBusiness } from '../types/domain'

export type EmployeeManageInteraction =
  | ChatInputCommandInteraction
  | StringSelectMenuInteraction
  | UserContextMenuCommandInteraction

export const data = new SlashCommandBuilder()
  .setName('employee')
  .setDescription('Manage employee roles for your business')
  .setDMPermission(false)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The Discord user to manage').setRequired(true),
  )

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const targetUser = interaction.options.getUser('user', true)
  await runEmployeeManage(interaction, targetUser.id)
}

/**
 * Entry point shared by the slash command and the context menu.
 * Resolves the command user's manageable businesses and either shows
 * a business selector (if multiple) or jumps straight to the management embed.
 */
export async function runEmployeeManage(
  interaction: EmployeeManageInteraction,
  targetDiscordId: string,
): Promise<void> {
  if (!interaction.guild) return

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(commandMember)
  const manageable = resolved.filter((r) => r.rank === 'manager' || r.rank === 'owner')

  if (manageable.length === 0) {
    await interaction.editReply(
      'You do not have management permissions for any business. Only managers and owners can use this command.',
    )
    return
  }

  if (targetDiscordId === commandMember.id) {
    await interaction.editReply('You cannot manage your own roles through this command.')
    return
  }

  let targetMember: GuildMember
  try {
    targetMember = await interaction.guild.members.fetch(targetDiscordId)
  } catch {
    await interaction.editReply('That user is not in this server.')
    return
  }

  if (manageable.length === 1) {
    await showEmployeeManageEmbed(interaction, manageable[0], targetMember)
    return
  }

  // Multiple businesses — show a selector
  const select = new StringSelectMenuBuilder()
    .setCustomId(`emp_business_select:${targetDiscordId}`)
    .setPlaceholder('Which business are you acting as?')
    .addOptions(
      manageable.map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.business.name)
          .setDescription(`Acting as ${r.rank}`)
          .setValue(r.business.id),
      ),
    )

  await interaction.editReply({
    content: 'You manage multiple businesses. Which are you acting as?',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}

/**
 * Build and display (or update) the employee management embed for the selected business.
 * Called after a business is chosen (or immediately if only one business).
 */
export async function showEmployeeManageEmbed(
  interaction: EmployeeManageInteraction,
  resolved: ResolvedBusiness,
  targetMember: GuildMember,
): Promise<void> {
  const config = getEmployeeConfig(resolved.business.slug)

  if (!config) {
    await interaction.editReply({
      content: `Employee management is not configured for **${resolved.business.name}** yet. Contact a bot administrator.`,
      components: [],
      embeds: [],
    })
    return
  }

  const sessionKey = storeEmployeeSession({
    commandUserDiscordId: interaction.user.id,
    commandUserRank: resolved.rank,
    targetDiscordId: targetMember.id,
    businessId: resolved.business.id,
    businessSlug: resolved.business.slug,
  })

  const response = buildEmployeeManageEmbed(targetMember, config, resolved.rank, sessionKey)
  await interaction.editReply({ ...response, content: null })
}
