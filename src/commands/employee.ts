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
import { resolveBusinesses, isBusinessOwner, ownedBusinessIds } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { cmd } from '../utils/cmdMention'
import { getEmployeeBusinessConfig, getEmployeeBusinessConfigsForGuild } from '../services/employeeService'
import { buildEmployeeManageEmbed } from '../embeds/employeeManageEmbed'
import { storeEmployeeSession } from '../services/interactionCache'
import { getTargetStatus } from '../services/employeeService'
import type { ResolvedBusiness } from '../types/domain'

export type EmployeeManageInteraction =
  | ChatInputCommandInteraction
  | StringSelectMenuInteraction
  | UserContextMenuCommandInteraction

export const data = new SlashCommandBuilder()
  .setName('employee')
  .setDescription('Manage employee roles for your business')
  .setDMPermission(false)
  .setDefaultMemberPermissions(0)
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

export async function runEmployeeManage(
  interaction: EmployeeManageInteraction,
  targetDiscordId: string,
): Promise<void> {
  if (!interaction.guild) return

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(commandMember)
  const resolved = await resolveBusinesses(commandMember)

  // Sudo users see all businesses; normal users only see ones they manage
  let manageable: ResolvedBusiness[]
  if (sudo) {
    const allBizRecords = await getAllBusinesses(interaction.guild.id)
    manageable = allBizRecords.map((b) => ({
      business: {
        id: b.id,
        name: b.name,
        slug: b.slug,
        providerType: b.providerType,
        guildId: b.guildId,
        active: b.active,
        settings: b.settings,
        createdAt: b.createdAt,
      },
      rank: 'owner' as const, // sudo users operate as owner
    }))
  } else {
    manageable = resolved.filter((r) => r.rank === 'manager' || r.rank === 'owner')
  }

  if (manageable.length === 0) {
    await interaction.editReply(
      'You do not have management permissions for any business. Only managers and owners can use this command.',
    )
    return
  }

  if (targetDiscordId === commandMember.id && !sudo) {
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
    await showEmployeeManageEmbed(interaction, manageable[0], targetMember, sudo)
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`emp_business_select:${targetDiscordId}`)
    .setPlaceholder('Which business are you acting as?')
    .addOptions(
      manageable.map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.business.name)
          .setDescription(sudo ? 'Sudo access' : `Acting as ${r.rank}`)
          .setValue(r.business.id),
      ),
    )

  await interaction.editReply({
    content: sudo
      ? 'Sudo mode — select a business to manage:'
      : 'You manage multiple businesses. Which are you acting as?',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}

export async function showEmployeeManageEmbed(
  interaction: EmployeeManageInteraction,
  resolved: ResolvedBusiness,
  targetMember: GuildMember,
  isSudo: boolean,
): Promise<void> {
  if (!interaction.guild) return

  const config = await getEmployeeBusinessConfig(resolved.business.id, interaction.guild.id)
  if (!config) {
    await interaction.editReply({
      content: `Employee management is not configured for **${resolved.business.name}** yet. Use ${cmd('portal', interaction.guild!.id)} to add role mappings.`,
      components: [],
    })
    return
  }

  const isDbOwner = await isBusinessOwner(targetMember.id, resolved.business.id)
  const status = getTargetStatus(targetMember, config, isDbOwner)

  // Cross-business employment summary — was N businesses × (1 + 1) DB
  // queries inside a Promise.all. Now: one query for all configs, one query
  // for all owner records. Scales O(1) regardless of how many businesses.
  const allConfigs = await getEmployeeBusinessConfigsForGuild(interaction.guild.id)
  const ownedSet = await ownedBusinessIds(targetMember.id, allConfigs.map((c) => c.businessId))
  const allConfigsWithOwnership = allConfigs.map((cfg) => ({
    name: cfg.name,
    config: cfg,
    isOwner: ownedSet.has(cfg.businessId),
  }))

  const sessionKey = storeEmployeeSession({
    commandUserDiscordId: interaction.user.id,
    commandUserRank: resolved.rank,
    targetDiscordId: targetMember.id,
    businessId: resolved.business.id,
    businessSlug: resolved.business.slug,
  })

  const response = buildEmployeeManageEmbed(
    targetMember,
    config,
    status,
    resolved.rank,
    sessionKey,
    isSudo,
    allConfigsWithOwnership,
  )
  await interaction.editReply({ ...response, content: null })
}
