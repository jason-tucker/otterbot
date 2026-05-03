import { type StringSelectMenuInteraction } from 'discord.js'
import { getEmployeeSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses, isBusinessOwner } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { buildEmployeeManageEmbed } from '../../embeds/employeeManageEmbed'
import { audit } from '../../services/auditService'
import { getAllBusinesses, getBusinessById } from '../../services/portalService'
import {
  getEmployeeBusinessConfig,
  getTargetStatus,
  assignCustomRole,
  removeCustomRole,
  canManageCustomRole,
  RoleMissingError,
  RoleHierarchyError,
} from '../../services/employeeService'

export async function handleEmployeeCustomRoleSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guild) return

  const sessionKey = interaction.customId.split(':')[1]
  const session = getEmployeeSession(sessionKey)
  if (!session) {
    await interaction.reply({ content: `This session has expired. Run ${cmd('employee', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  await interaction.deferUpdate()

  // value: "{assign|remove}:{roleId}"
  const firstColon = interaction.values[0].indexOf(':')
  const actionPart = interaction.values[0].slice(0, firstColon) as 'assign' | 'remove'
  const roleId = interaction.values[0].slice(firstColon + 1)

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(commandMember)
  const resolved = await resolveBusinesses(commandMember)

  let managedBusiness = resolved.find(
    (r) => r.business.id === session.businessId && (r.rank === 'manager' || r.rank === 'owner'),
  )
  if (!managedBusiness && sudo) {
    const biz = await getBusinessById(session.businessId)
    if (biz) managedBusiness = { business: { id: biz.id, name: biz.name, slug: biz.slug, providerType: biz.providerType, guildId: biz.guildId, active: biz.active, settings: biz.settings, createdAt: biz.createdAt }, rank: 'owner' }
  }
  if (!managedBusiness) {
    await interaction.editReply({ content: 'You no longer have management access to this business.', components: [] })
    return
  }

  const config = await getEmployeeBusinessConfig(session.businessId, interaction.guild.id)
  if (!config) {
    await interaction.editReply({ content: 'Employee management is not configured for this business.', components: [] })
    return
  }

  const customRole = config.roles.custom.find((cr) => cr.roleId === roleId)
  if (!customRole) {
    await interaction.editReply({ content: 'That role is not configured for this business.', components: [] })
    return
  }

  const permCheck = canManageCustomRole(managedBusiness.rank, customRole, config, sudo)
  if (!permCheck.allowed) {
    await interaction.editReply({ content: `Permission denied: ${permCheck.reason}`, components: [] })
    return
  }

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(session.targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'The target user is no longer in this server.', components: [] })
    return
  }

  const auditAction = actionPart === 'assign' ? 'assign_custom_role' : 'remove_custom_role'
  let success = false

  try {
    if (actionPart === 'assign') {
      await assignCustomRole(interaction.guild, targetMember, config, customRole)
    } else {
      await removeCustomRole(interaction.guild, targetMember, customRole)
    }
    success = true
  } catch (err) {
    if (err instanceof RoleMissingError) {
      await interaction.editReply({ content: `**Role not found:** \`${err.roleName}\`\nCheck role config in ${cmd('portal', interaction.guildId!)}.`, components: [] })
      return
    }
    if (err instanceof RoleHierarchyError) {
      await interaction.editReply({ content: `**Role hierarchy error:** Cannot manage \`${err.roleName}\`.`, components: [] })
      return
    }
    throw err
  } finally {
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId: session.businessId,
      action: auditAction,
      targetType: 'discord_user',
      targetId: session.targetDiscordId,
      success,
      details: { role: customRole.label, businessSlug: config.slug },
    })
  }

  const updatedTarget = await interaction.guild.members.fetch({ user: session.targetDiscordId, force: true })
  const updatedDbOwner = await isBusinessOwner(updatedTarget.id, session.businessId)
  const updatedStatus = getTargetStatus(updatedTarget, config, updatedDbOwner)

  const allBizRecords = await getAllBusinesses(interaction.guild.id)
  const allConfigs = await Promise.all(
    allBizRecords.map(async (b) => {
      const cfg = await getEmployeeBusinessConfig(b.id, interaction.guild!.id)
      const ownerCheck = cfg ? await isBusinessOwner(updatedTarget.id, b.id) : false
      return { name: b.name, config: cfg!, isOwner: ownerCheck }
    }),
  ).then((r) => r.filter((x) => x.config !== null))

  const response = buildEmployeeManageEmbed(updatedTarget, config, updatedStatus, managedBusiness.rank, sessionKey, sudo, allConfigs)
  await interaction.editReply(response)
}
