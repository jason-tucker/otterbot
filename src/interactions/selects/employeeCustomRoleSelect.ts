import { type StringSelectMenuInteraction } from 'discord.js'
import { getEmployeeSession } from '../../services/interactionCache'
import { resolveBusinesses } from '../../services/permissionService'
import { getEmployeeConfig } from '../../config/employee-businesses.config'
import { buildEmployeeManageEmbed } from '../../embeds/employeeManageEmbed'
import { audit } from '../../services/auditService'
import {
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

  // customId format: emp_custom_role:{sessionKey}
  const sessionKey = interaction.customId.split(':')[1]
  const session = getEmployeeSession(sessionKey)

  if (!session) {
    await interaction.reply({
      content: 'This session has expired. Run `/employee` again.',
      ephemeral: true,
    })
    return
  }

  await interaction.deferUpdate()

  // value format: "{assign|remove}:{roleName}"
  // Role names may not contain ':' but we use split limit to be safe
  const valueStr = interaction.values[0]
  const firstColon = valueStr.indexOf(':')
  const actionPart = valueStr.slice(0, firstColon) as 'assign' | 'remove'
  const roleName = valueStr.slice(firstColon + 1)

  // Re-validate command user permissions
  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(commandMember)
  const managedBusiness = resolved.find(
    (r) => r.business.id === session.businessId && (r.rank === 'manager' || r.rank === 'owner'),
  )

  if (!managedBusiness) {
    await interaction.editReply({
      content: 'You no longer have management access to this business.',
      components: [],
      embeds: [],
    })
    return
  }

  const config = getEmployeeConfig(managedBusiness.business.slug)
  if (!config) {
    await interaction.editReply({
      content: 'Employee management is not configured for this business.',
      components: [],
      embeds: [],
    })
    return
  }

  const customRole = config.roles.custom.find((cr) => cr.name === roleName)
  if (!customRole) {
    await interaction.editReply({
      content: `That role (\`${roleName}\`) is not configured for this business.`,
      components: [],
      embeds: [],
    })
    return
  }

  const permCheck = canManageCustomRole(managedBusiness.rank, customRole, config)
  if (!permCheck.allowed) {
    await interaction.editReply({
      content: `Permission denied: ${permCheck.reason}`,
      components: [],
      embeds: [],
    })
    return
  }

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(session.targetDiscordId)
  } catch {
    await interaction.editReply({
      content: 'The target user is no longer in this server.',
      components: [],
      embeds: [],
    })
    return
  }

  const auditAction = actionPart === 'assign' ? 'assign_custom_role' : 'remove_custom_role'
  let success = false

  try {
    if (actionPart === 'assign') {
      await assignCustomRole(interaction.guild, targetMember, config, customRole)
    } else {
      await removeCustomRole(interaction.guild, targetMember, config, customRole)
    }
    success = true
  } catch (err) {
    if (err instanceof RoleMissingError) {
      await interaction.editReply({
        content: `**Role not found:** \`${err.roleName}\`\nCheck the employee config and run \`pnpm scan:roles\` to verify all role names are correct.`,
        components: [],
        embeds: [],
      })
      return
    }
    if (err instanceof RoleHierarchyError) {
      await interaction.editReply({
        content: `**Role hierarchy error:** Cannot manage \`${err.roleName}\`.\nThe bot's highest role must be above all business roles in server settings.`,
        components: [],
        embeds: [],
      })
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

  const updatedTarget = await interaction.guild.members.fetch({
    user: session.targetDiscordId,
    force: true,
  })

  const currentStatus = getTargetStatus(updatedTarget, config)
  void currentStatus // getTargetStatus is called inside buildEmployeeManageEmbed — but we verify the fetch succeeded

  const response = buildEmployeeManageEmbed(
    updatedTarget,
    config,
    managedBusiness.rank,
    sessionKey,
  )
  await interaction.editReply(response)
}
