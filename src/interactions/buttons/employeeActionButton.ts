import { type ButtonInteraction } from 'discord.js'
import { getEmployeeSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses, isBusinessOwner } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { buildEmployeeManageEmbed } from '../../embeds/employeeManageEmbed'
import { audit } from '../../services/auditService'
import { getAllBusinesses, addBusinessOwner, removeBusinessOwner } from '../../services/portalService'
import {
  getEmployeeBusinessConfig,
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
  | 'emp_make_db_owner'
  | 'emp_revoke_db_owner'

export async function handleEmployeeActionButton(interaction: ButtonInteraction): Promise<void> {
  const colonIdx = interaction.customId.indexOf(':')
  const action = interaction.customId.slice(0, colonIdx) as EmployeeButtonAction
  const sessionKey = interaction.customId.slice(colonIdx + 1)

  const session = getEmployeeSession(sessionKey)
  if (!session) {
    await interaction.reply({ content: `This session has expired. Run ${cmd('employee', interaction.guildId!)} again.`, ephemeral: true })
    return
  }

  if (!interaction.guild) return
  await interaction.deferUpdate()

  const commandMember = await interaction.guild.members.fetch(interaction.user.id)
  const sudo = isSudoUser(commandMember)
  const resolved = await resolveBusinesses(commandMember)

  const managedBusiness = sudo
    ? resolved.find((r) => r.business.id === session.businessId) ??
      { business: { id: session.businessId, name: '', slug: '', providerType: 'discord-only' as const, guildId: interaction.guild.id, active: true, settings: null, createdAt: new Date() }, rank: 'owner' as const }
    : resolved.find((r) => r.business.id === session.businessId && (r.rank === 'manager' || r.rank === 'owner'))

  if (!managedBusiness && !sudo) {
    await interaction.editReply({ content: 'You no longer have management access to this business.', components: [] })
    return
  }

  const config = await getEmployeeBusinessConfig(session.businessId, interaction.guild.id)
  if (!config) {
    await interaction.editReply({ content: 'Employee management is not configured for this business.', components: [] })
    return
  }

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(session.targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'The target user is no longer in this server.', components: [] })
    return
  }

  const commandRank = managedBusiness?.rank ?? 'owner'
  const isDbOwner = await isBusinessOwner(targetMember.id, session.businessId)
  const currentStatus = getTargetStatus(targetMember, config, isDbOwner)

  const permCheck = (() => {
    switch (action) {
      case 'emp_hire':          return canHire(commandRank, sudo)
      case 'emp_fire':          return canFire(commandRank, currentStatus.highestRank, config, sudo)
      case 'emp_to_manager':    return canPromoteToManager(commandRank, config, sudo)
      case 'emp_to_employee':   return canDemoteManager(commandRank, config, sudo)
      case 'emp_to_owner':           return canManageOwner(commandRank, config, sudo)
      case 'emp_owner_to_manager':   return canManageOwner(commandRank, config, sudo)
      case 'emp_owner_to_employee':  return canManageOwner(commandRank, config, sudo)
      case 'emp_make_db_owner':      return sudo ? { allowed: true } : { allowed: false, reason: 'Only sudo users can designate business owners.' }
      case 'emp_revoke_db_owner':    return sudo ? { allowed: true } : { allowed: false, reason: 'Only sudo users can revoke business ownership.' }
    }
  })()

  if (!permCheck.allowed) {
    await interaction.editReply({ content: `Permission denied: ${permCheck.reason}`, components: [] })
    return
  }

  let auditAction = action.replace('emp_', '')
  let success = false

  try {
    switch (action) {
      case 'emp_hire':               await hireEmployee(interaction.guild, targetMember, config);           auditAction = 'hire_employee'; break
      case 'emp_fire':               await fireFromBusiness(interaction.guild, targetMember, config);       auditAction = 'fire_from_business'; break
      case 'emp_to_manager':         await promoteToManager(interaction.guild, targetMember, config);       auditAction = 'promote_to_manager'; break
      case 'emp_to_employee':        await demoteToEmployee(interaction.guild, targetMember, config);       auditAction = 'demote_to_employee'; break
      case 'emp_to_owner':           await promoteToOwner(interaction.guild, targetMember, config);         auditAction = 'promote_to_owner'; break
      case 'emp_owner_to_manager':   await demoteOwnerToManager(interaction.guild, targetMember, config);  auditAction = 'demote_owner_to_manager'; break
      case 'emp_owner_to_employee':  await demoteOwnerToEmployee(interaction.guild, targetMember, config); auditAction = 'demote_owner_to_employee'; break
      case 'emp_make_db_owner': {
        await addBusinessOwner(session.businessId, session.targetDiscordId, interaction.user.id)
        // Best-effort: also assign the Discord owner role if configured
        if (config.roles.owner) {
          try {
            const ownerRole = interaction.guild.roles.cache.get(config.roles.owner.roleId)
              ?? await interaction.guild.roles.fetch(config.roles.owner.roleId)
            if (ownerRole) await targetMember.roles.add(ownerRole)
          } catch { /* role assignment is best-effort; DB record is the authoritative change */ }
        }
        auditAction = 'make_db_owner'
        break
      }
      case 'emp_revoke_db_owner': {
        await removeBusinessOwner(session.businessId, session.targetDiscordId)
        // Best-effort: also remove the Discord owner role if the member holds it
        if (config.roles.owner && targetMember.roles.cache.has(config.roles.owner.roleId)) {
          try {
            const ownerRole = interaction.guild.roles.cache.get(config.roles.owner.roleId)
              ?? await interaction.guild.roles.fetch(config.roles.owner.roleId)
            if (ownerRole) await targetMember.roles.remove(ownerRole)
          } catch { /* best-effort */ }
        }
        auditAction = 'revoke_db_owner'
        break
      }
    }
    success = true
  } catch (err) {
    if (err instanceof RoleMissingError) {
      await interaction.editReply({ content: `**Role not found:** \`${err.roleName}\`\nCheck the business role config in ${cmd('portal', interaction.guildId!)}.`, components: [] })
      return
    }
    if (err instanceof RoleHierarchyError) {
      await interaction.editReply({ content: `**Role hierarchy error:** Cannot manage \`${err.roleName}\`. The bot's role must be above all business roles.`, components: [] })
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
  ).then((results) => results.filter((r) => r.config !== null))

  const response = buildEmployeeManageEmbed(updatedTarget, config, updatedStatus, commandRank, sessionKey, sudo, allConfigs)
  await interaction.editReply(response)
}
