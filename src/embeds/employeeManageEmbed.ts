import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type GuildMember,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import type { DbEmployeeBusinessConfig, DbCustomRole, TargetEmploymentStatus } from '../services/employeeService'
import {
  canHire,
  canFire,
  canPromoteToManager,
  canDemoteManager,
  canManageOwner,
  canManageCustomRole,
} from '../services/employeeService'
import type { StaffRank } from '../types/domain'

const RANK_COLORS: Record<string, number> = {
  owner: 0x9b59b6,
  manager: 0xf1c40f,
  employee: 0x2ecc71,
  none: 0x5865f2,
}

/**
 * Build the employee management embed and dynamic action components.
 * Status and permissions are recomputed fresh on every render.
 *
 * @param isSudo - if true, all action buttons are shown regardless of rank
 */
export function buildEmployeeManageEmbed(
  targetMember: GuildMember,
  config: DbEmployeeBusinessConfig,
  status: TargetEmploymentStatus,
  commandUserRank: StaffRank,
  sessionKey: string,
  isSudo: boolean,
  allConfigs: { name: string; config: DbEmployeeBusinessConfig; isOwner: boolean }[],
): {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
} {
  const color = RANK_COLORS[status.highestRank ?? 'none'] ?? RANK_COLORS.none

  // Build cross-business employment summary from pre-fetched configs
  const employmentSummary: string[] = []
  for (const { name, config: bConfig, isOwner: dbOwner } of allConfigs) {
    const hasEmp = !!bConfig.roles.employee && targetMember.roles.cache.has(bConfig.roles.employee.roleId)
    const hasMgr = !!bConfig.roles.manager && targetMember.roles.cache.has(bConfig.roles.manager.roleId)
    const hasOwnRole = !!bConfig.roles.owner && targetMember.roles.cache.has(bConfig.roles.owner.roleId)
    const effectiveOwner = dbOwner || (bConfig.permissions.allowOwnerRoleFallback && hasOwnRole)
    const customHeld = bConfig.roles.custom.filter(
      (cr) => targetMember.roles.cache.has(cr.roleId),
    )
    if (!hasEmp && !hasMgr && !effectiveOwner && customHeld.length === 0) continue
    const parts: string[] = []
    if (effectiveOwner) parts.push('Owner')
    if (hasMgr) parts.push('Manager')
    if (hasEmp) parts.push('Employee')
    for (const cr of customHeld) parts.push(cr.label)
    employmentSummary.push(`**${name}** — ${parts.join(', ')}`)
  }

  const createdAt = Math.floor(targetMember.user.createdTimestamp / 1000)
  const joinedAt = targetMember.joinedTimestamp
    ? Math.floor(targetMember.joinedTimestamp / 1000)
    : null

  // Current status in selected business
  let businessStatusText: string
  if (!status.inBusiness) {
    businessStatusText = 'Not employed'
  } else {
    const parts: string[] = []
    if (status.isOwner) parts.push('Owner')
    if (status.hasManagerRole) parts.push('Manager')
    if (status.hasEmployeeRole) parts.push('Employee')
    for (const cr of status.customRolesHeld) parts.push(cr.label)
    businessStatusText = parts.join(', ')
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(targetMember.displayName)
    .setThumbnail(targetMember.user.displayAvatarURL())
    .setDescription(`<@${targetMember.id}>`)
    .addFields(
      { name: 'User ID', value: targetMember.id, inline: true },
      { name: 'Account Created', value: `<t:${createdAt}:D>`, inline: true },
      { name: 'Server Joined', value: joinedAt ? `<t:${joinedAt}:D>` : 'Unknown', inline: true },
      {
        name: 'Currently Employed At',
        value: employmentSummary.length > 0 ? employmentSummary.join('\n') : 'No businesses',
      },
      { name: 'Editing Business', value: `**${config.name}**`, inline: true },
      { name: 'Status in Business', value: businessStatusText, inline: true },
    )
    .setFooter({
      text: `Managing: ${config.name}${isSudo ? ' · Sudo mode' : ''}`,
    })
    .setTimestamp()

  // ---------------------------------------------------------------------------
  // Action buttons
  // ---------------------------------------------------------------------------
  const buttons: ButtonBuilder[] = []

  if (!status.inBusiness) {
    if (canHire(commandUserRank, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_hire:${sessionKey}`)
          .setLabel('Hire as Employee')
          .setStyle(ButtonStyle.Success),
      )
    }
    if (canPromoteToManager(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_manager:${sessionKey}`)
          .setLabel('Add as Manager')
          .setStyle(ButtonStyle.Primary),
      )
    }
    if (canManageOwner(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Add as Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'employee') {
    if (canFire(commandUserRank, 'employee', config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_fire:${sessionKey}`)
          .setLabel('Remove from Business')
          .setStyle(ButtonStyle.Danger),
      )
    }
    if (canPromoteToManager(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_manager:${sessionKey}`)
          .setLabel('Promote to Manager')
          .setStyle(ButtonStyle.Primary),
      )
    }
    if (canManageOwner(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Promote to Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'manager') {
    if (canFire(commandUserRank, 'manager', config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_fire:${sessionKey}`)
          .setLabel('Remove from Business')
          .setStyle(ButtonStyle.Danger),
      )
    }
    if (canDemoteManager(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_employee:${sessionKey}`)
          .setLabel('Demote to Employee')
          .setStyle(ButtonStyle.Secondary),
      )
    }
    if (canManageOwner(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Promote to Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'owner') {
    if (canManageOwner(commandUserRank, config, isSudo).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_fire:${sessionKey}`)
          .setLabel('Remove from Business')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`emp_owner_to_manager:${sessionKey}`)
          .setLabel('Demote to Manager')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`emp_owner_to_employee:${sessionKey}`)
          .setLabel('Demote to Employee')
          .setStyle(ButtonStyle.Secondary),
      )
    }
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  if (buttons.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(0, 5)),
    )
  }
  if (buttons.length > 5) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(5, 10)),
    )
  }

  // Custom roles select menu
  if (config.roles.custom.length > 0) {
    const manageable = config.roles.custom.filter(
      (cr) => canManageCustomRole(commandUserRank, cr, config, isSudo).allowed,
    )
    if (manageable.length > 0) {
      const options = manageable.map((cr: DbCustomRole) => {
        const held = status.customRolesHeld.some((h) => h.roleId === cr.roleId)
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${held ? '✅ Remove' : '➕ Assign'}: ${cr.label}`)
          .setValue(`${held ? 'remove' : 'assign'}:${cr.roleId}`)
          .setDescription(held ? `Remove the ${cr.label} role` : `Assign the ${cr.label} role`)
      })
      components.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`emp_custom_role:${sessionKey}`)
            .setPlaceholder('Manage special roles...')
            .addOptions(options),
        ),
      )
    }
  }

  return { embeds: [embed], components }
}
