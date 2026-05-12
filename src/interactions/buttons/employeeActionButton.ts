import { type ButtonInteraction } from 'discord.js'
import { getEmployeeSession } from '../../services/interactionCache'
import { cmd } from '../../utils/cmdMention'
import { resolveBusinesses, isBusinessOwner, ownedBusinessIds } from '../../services/permissionService'
import { isSudoUser } from '../../services/sudoService'
import { buildEmployeeManageEmbed } from '../../embeds/employeeManageEmbed'
import { audit } from '../../services/auditService'
import { addBusinessOwner, removeBusinessOwner, getBusinessById } from '../../services/portalService'
import { publish, employeeCh, type EmployeeEvent } from '../../services/eventBus'
import {
  getEmployeeBusinessConfig,
  getEmployeeBusinessConfigsForGuild,
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

  // For sudo, verify the business actually belongs to this guild before
  // synthesizing an "owner" ResolvedBusiness — otherwise a sudo in guild A
  // could click a session referring to a business attached to guild B and
  // we'd mutate roles in the wrong server.
  let managedBusiness
  if (sudo) {
    const fromCallerGuild = resolved.find((r) => r.business.id === session.businessId)
    if (fromCallerGuild) {
      managedBusiness = fromCallerGuild
    } else {
      const bizRecord = await getBusinessById(session.businessId)
      if (!bizRecord || bizRecord.guildId !== interaction.guild.id) {
        await interaction.editReply({ content: 'This management session belongs to a different server.', components: [] })
        return
      }
      managedBusiness = { business: bizRecord, rank: 'owner' as const }
    }
  } else {
    managedBusiness = resolved.find((r) => r.business.id === session.businessId && (r.rank === 'manager' || r.rank === 'owner'))
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

  let targetMember
  try {
    targetMember = await interaction.guild.members.fetch(session.targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'The target user is no longer in this server.', components: [] })
    return
  }

  if (targetMember.id === interaction.client.user?.id) {
    await audit({
      actorDiscordId: interaction.user.id,
      actorName: interaction.user.username,
      businessId: session.businessId,
      action: 'block_self_manage_bot',
      targetType: 'discord_user',
      targetId: targetMember.id,
      success: false,
    })
    await interaction.editReply({ content: "You cannot manage the bot's own roles.", components: [] })
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
    // Mirror to Redis after the role mutation succeeded — the panel listens
    // for these to update its employee-card view live. `audit_logs` is the
    // authoritative record, this is just the live-tail.
    const evt = mapAuditToEmployeeEvent(auditAction)
    if (evt) {
      void publish(employeeCh(evt), {
        businessId: session.businessId,
        targetId: session.targetDiscordId,
        action: auditAction,
        by: interaction.user.id,
        ts: new Date().toISOString(),
        details: { businessSlug: config.slug },
      })
    }
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

  // Drop force:true — the role mutations earlier in the handler already
  // updated the cached GuildMember; force-refetching wastes an API call.
  const updatedTarget = await interaction.guild.members.fetch(session.targetDiscordId)
  const updatedDbOwner = await isBusinessOwner(updatedTarget.id, session.businessId)
  const updatedStatus = getTargetStatus(updatedTarget, config, updatedDbOwner)

  // Batched cross-business summary — one query for all configs + one query
  // for all owner records, instead of ~3 queries per business in a fan-out.
  const allConfigs = await getEmployeeBusinessConfigsForGuild(interaction.guild.id)
  const ownedSet = await ownedBusinessIds(updatedTarget.id, allConfigs.map((c) => c.businessId))
  const allConfigsWithOwnership = allConfigs.map((cfg) => ({
    name: cfg.name,
    config: cfg,
    isOwner: ownedSet.has(cfg.businessId),
  }))

  const response = buildEmployeeManageEmbed(updatedTarget, config, updatedStatus, commandRank, sessionKey, sudo, allConfigsWithOwnership)
  await interaction.editReply(response)
}

/**
 * Map an internal `audit_logs.action` string to the panel-facing employee
 * event name. Returns `null` for actions that don't have a corresponding
 * event (e.g. `block_self_manage_bot` audit lines, DB-owner-only changes).
 */
function mapAuditToEmployeeEvent(auditAction: string): EmployeeEvent | null {
  switch (auditAction) {
    case 'hire_employee':              return 'hired'
    case 'fire_from_business':         return 'fired'
    case 'promote_to_manager':         return 'promoted'
    case 'promote_to_owner':           return 'promoted'
    case 'demote_to_employee':         return 'demoted'
    case 'demote_owner_to_manager':    return 'demoted'
    case 'demote_owner_to_employee':   return 'demoted'
    case 'make_db_owner':              return 'promoted'
    case 'revoke_db_owner':            return 'demoted'
    default: return null
  }
}
