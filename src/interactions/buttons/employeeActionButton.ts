import { type ButtonInteraction } from 'discord.js'
import { getEmployeeSession } from '../../services/interactionCache'
import { resolveBusinesses } from '../../services/permissionService'
import { getEmployeeConfig } from '../../config/employee-businesses.config'
import { buildEmployeeManageEmbed } from '../../embeds/employeeManageEmbed'
import { audit } from '../../services/auditService'
import {
  getTargetStatus,
  hireEmployee,
  fireFromBusiness,
  promoteToManager,
  demoteToEmployee,
  promoteToOwner,
  demoteOwnerToManager,
  demoteOwnerToEmployee,
  canHire,
  canFire,
  canPromoteToManager,
  canDemoteManager,
  canManageOwner,
  RoleMissingError,
  RoleHierarchyError,
} from '../../services/employeeService'

type EmployeeButtonAction =
  | 'emp_hire'
  | 'emp_fire'
  | 'emp_to_manager'
  | 'emp_to_employee'
  | 'emp_to_owner'
  | 'emp_owner_to_manager'
  | 'emp_owner_to_employee'

export async function handleEmployeeActionButton(interaction: ButtonInteraction): Promise<void> {
  // customId format: {action}:{sessionKey}
  const colonIdx = interaction.customId.indexOf(':')
  const action = interaction.customId.slice(0, colonIdx) as EmployeeButtonAction
  const sessionKey = interaction.customId.slice(colonIdx + 1)

  const session = getEmployeeSession(sessionKey)
  if (!session) {
    await interaction.reply({
      content: 'This session has expired. Run `/employee` again.',
      ephemeral: true,
    })
    return
  }

  if (!interaction.guild) return

  await interaction.deferUpdate()

  // Re-validate the command user's permissions on every click
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

  const commandRank = managedBusiness.rank
  const currentStatus = getTargetStatus(targetMember, config)

  // Re-check permissions for the specific action
  const permCheck = (() => {
    switch (action) {
      case 'emp_hire':
        return canHire(commandRank)
      case 'emp_fire':
        return canFire(commandRank, currentStatus.highestRank, config)
      case 'emp_to_manager':
        return canPromoteToManager(commandRank, config)
      case 'emp_to_employee':
        return canDemoteManager(commandRank, config)
      case 'emp_to_owner':
        return canManageOwner(commandRank, config)
      case 'emp_owner_to_manager':
        return canManageOwner(commandRank, config)
      case 'emp_owner_to_employee':
        return canManageOwner(commandRank, config)
    }
  })()

  if (!permCheck.allowed) {
    await interaction.editReply({
      content: `Permission denied: ${permCheck.reason}`,
      components: [],
      embeds: [],
    })
    return
  }

  let auditAction = action.replace('emp_', '')
  let success = false

  try {
    switch (action) {
      case 'emp_hire':
        await hireEmployee(interaction.guild, targetMember, config)
        auditAction = 'hire_employee'
        break
      case 'emp_fire':
        await fireFromBusiness(interaction.guild, targetMember, config)
        auditAction = 'fire_from_business'
        break
      case 'emp_to_manager':
        await promoteToManager(interaction.guild, targetMember, config)
        auditAction = 'promote_to_manager'
        break
      case 'emp_to_employee':
        await demoteToEmployee(interaction.guild, targetMember, config)
        auditAction = 'demote_to_employee'
        break
      case 'emp_to_owner':
        await promoteToOwner(interaction.guild, targetMember, config)
        auditAction = 'promote_to_owner'
        break
      case 'emp_owner_to_manager':
        await demoteOwnerToManager(interaction.guild, targetMember, config)
        auditAction = 'demote_owner_to_manager'
        break
      case 'emp_owner_to_employee':
        await demoteOwnerToEmployee(interaction.guild, targetMember, config)
        auditAction = 'demote_owner_to_employee'
        break
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
      details: { businessSlug: config.slug },
    })
  }

  // Re-fetch target with fresh role data and rebuild the embed in-place
  const updatedTarget = await interaction.guild.members.fetch({
    user: session.targetDiscordId,
    force: true,
  })

  const response = buildEmployeeManageEmbed(updatedTarget, config, commandRank, sessionKey)
  await interaction.editReply(response)
}
