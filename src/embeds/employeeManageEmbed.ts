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
import {
  EMPLOYEE_BUSINESSES,
  type EmployeeBusinessConfig,
} from '../config/employee-businesses.config'
import {
  getTargetStatus,
  canHire,
  canFire,
  canPromoteToManager,
  canDemoteManager,
  canManageOwner,
  canManageCustomRole,
} from '../services/employeeService'
import type { StaffRank } from '../types/domain'

const RANK_COLORS: Record<string, number> = {
  owner: 0x9b59b6,   // Purple
  manager: 0xf1c40f, // Gold
  employee: 0x2ecc71, // Green
  none: 0x5865f2,    // Discord blue (not employed)
}

function rankLabel(rank: StaffRank | null): string {
  if (!rank) return 'Not Employed'
  return rank.charAt(0).toUpperCase() + rank.slice(1)
}

/**
 * Build the employee management embed and action components.
 * Components are dynamic based on the target's current status and the command
 * user's rank — re-evaluated on every render to stay accurate after role changes.
 */
export function buildEmployeeManageEmbed(
  targetMember: GuildMember,
  config: EmployeeBusinessConfig,
  commandUserRank: StaffRank,
  sessionKey: string,
): {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
} {
  const status = getTargetStatus(targetMember, config)
  const color = RANK_COLORS[status.highestRank ?? 'none'] ?? RANK_COLORS.none

  // Collect employment info across all configured businesses for the summary field
  const employmentSummary: string[] = []
  for (const biz of EMPLOYEE_BUSINESSES) {
    const s = getTargetStatus(targetMember, biz)
    if (!s.inBusiness) continue
    const parts: string[] = []
    if (s.hasOwnerRole) parts.push('Owner')
    if (s.hasManagerRole) parts.push('Manager')
    if (s.hasEmployeeRole) parts.push('Employee')
    for (const cr of s.customRolesHeld) parts.push(cr.label)
    employmentSummary.push(`**${biz.name}** — ${parts.join(', ')}`)
  }

  const createdAt = Math.floor(targetMember.user.createdTimestamp / 1000)
  const joinedAt = targetMember.joinedTimestamp
    ? Math.floor(targetMember.joinedTimestamp / 1000)
    : null

  // Status line for the selected business
  let businessStatusText: string
  if (!status.inBusiness) {
    businessStatusText = 'Not employed'
  } else {
    const parts: string[] = []
    if (status.hasOwnerRole) parts.push('Owner')
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
      {
        name: 'Status in Business',
        value: businessStatusText,
        inline: true,
      },
    )
    .setFooter({ text: `Managing: ${config.name} · Rank shown: ${rankLabel(status.highestRank)}` })
    .setTimestamp()

  // ---------------------------------------------------------------------------
  // Action buttons — determined by target status and command user rank
  // ---------------------------------------------------------------------------
  const buttons: ButtonBuilder[] = []

  if (!status.inBusiness) {
    if (canHire(commandUserRank).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_hire:${sessionKey}`)
          .setLabel('Hire as Employee')
          .setStyle(ButtonStyle.Success),
      )
    }
    if (canPromoteToManager(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_manager:${sessionKey}`)
          .setLabel('Add as Manager')
          .setStyle(ButtonStyle.Primary),
      )
    }
    if (canManageOwner(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Add as Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'employee') {
    if (canFire(commandUserRank, 'employee', config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_fire:${sessionKey}`)
          .setLabel('Remove from Business')
          .setStyle(ButtonStyle.Danger),
      )
    }
    if (canPromoteToManager(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_manager:${sessionKey}`)
          .setLabel('Promote to Manager')
          .setStyle(ButtonStyle.Primary),
      )
    }
    if (canManageOwner(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Promote to Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'manager') {
    if (canFire(commandUserRank, 'manager', config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_fire:${sessionKey}`)
          .setLabel('Remove from Business')
          .setStyle(ButtonStyle.Danger),
      )
    }
    if (canDemoteManager(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_employee:${sessionKey}`)
          .setLabel('Demote to Employee')
          .setStyle(ButtonStyle.Secondary),
      )
    }
    if (canManageOwner(commandUserRank, config).allowed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_to_owner:${sessionKey}`)
          .setLabel('Promote to Owner')
          .setStyle(ButtonStyle.Primary),
      )
    }
  } else if (status.highestRank === 'owner') {
    if (canManageOwner(commandUserRank, config).allowed) {
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

  // ---------------------------------------------------------------------------
  // Custom roles select menu (if the business has custom roles the user can manage)
  // ---------------------------------------------------------------------------
  if (config.roles.custom.length > 0) {
    const manageable = config.roles.custom.filter(
      (cr) => canManageCustomRole(commandUserRank, cr, config).allowed,
    )

    if (manageable.length > 0) {
      const options = manageable.map((cr) => {
        const held = status.customRolesHeld.some((h) => h.name === cr.name)
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${held ? '✅ Remove' : '➕ Assign'}: ${cr.label}`)
          .setValue(`${held ? 'remove' : 'assign'}:${cr.name}`)
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
