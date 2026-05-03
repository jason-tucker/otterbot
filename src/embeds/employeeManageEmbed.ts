import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  SeparatorSpacingSize,
  MessageFlags,
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

export function buildEmployeeManageEmbed(
  targetMember: GuildMember,
  config: DbEmployeeBusinessConfig,
  status: TargetEmploymentStatus,
  commandUserRank: StaffRank,
  sessionKey: string,
  isSudo: boolean,
  allConfigs: { name: string; config: DbEmployeeBusinessConfig; isOwner: boolean }[],
): {
  flags: number
  components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[]
} {
  const color = RANK_COLORS[status.highestRank ?? 'none'] ?? RANK_COLORS.none

  // Cross-business employment summary
  const employmentSummary: string[] = []
  for (const { name, config: bConfig, isOwner: dbOwner } of allConfigs) {
    const hasEmp = !!bConfig.roles.employee && targetMember.roles.cache.has(bConfig.roles.employee.roleId)
    const hasMgr = !!bConfig.roles.manager && targetMember.roles.cache.has(bConfig.roles.manager.roleId)
    const hasOwnRole = !!bConfig.roles.owner && targetMember.roles.cache.has(bConfig.roles.owner.roleId)
    const effectiveOwner = dbOwner || (bConfig.permissions.allowOwnerRoleFallback && hasOwnRole)
    const customHeld = bConfig.roles.custom.filter((cr) => targetMember.roles.cache.has(cr.roleId))
    if (!hasEmp && !hasMgr && !effectiveOwner && customHeld.length === 0) continue
    const parts: string[] = []
    if (effectiveOwner) parts.push('Owner')
    if (hasMgr) parts.push('Manager')
    if (hasEmp) parts.push('Employee')
    for (const cr of customHeld) parts.push(cr.label)
    employmentSummary.push(`**${name}** — ${parts.join(', ')}`)
  }

  const createdAt = Math.floor(targetMember.user.createdTimestamp / 1000)
  const joinedAt = targetMember.joinedTimestamp ? Math.floor(targetMember.joinedTimestamp / 1000) : null

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

  // ---------------------------------------------------------------------------
  // Container layout
  // ---------------------------------------------------------------------------
  const container = new ContainerBuilder().setAccentColor(color)

  // Header: name + mention with avatar thumbnail
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${targetMember.displayName}\n<@${targetMember.id}>`),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(targetMember.user.displayAvatarURL()),
      ),
  )

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))

  // Account info row
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# USER ID · ACCOUNT CREATED · SERVER JOINED\n${targetMember.id} · <t:${createdAt}:D> · ${joinedAt ? `<t:${joinedAt}:D>` : 'Unknown'}`,
    ),
  )

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))

  // Employment summary
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Currently Employed At**\n${employmentSummary.length > 0 ? employmentSummary.join('\n') : '*No businesses*'}`,
    ),
  )

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))

  // Current business + status
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Editing Business** · ${config.name}\n**Status** · ${businessStatusText}`,
    ),
  )

  // Footer
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Managing: ${config.name}${isSudo ? ' · Sudo mode' : ''} · <t:${Math.floor(Date.now() / 1000)}:t>`,
    ),
  )

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
    if (!isSudo && canManageOwner(commandUserRank, config, isSudo).allowed) {
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
    if (!isSudo && canManageOwner(commandUserRank, config, isSudo).allowed) {
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
    if (!isSudo && canManageOwner(commandUserRank, config, isSudo).allowed) {
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

  // Sudo-only DB ownership buttons
  if (isSudo) {
    if (!status.isDbOwner) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_make_db_owner:${sessionKey}`)
          .setLabel('Make Owner')
          .setStyle(ButtonStyle.Primary),
      )
    } else {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`emp_revoke_db_owner:${sessionKey}`)
          .setLabel('Revoke Owner')
          .setStyle(ButtonStyle.Danger),
      )
    }
  }

  const allComponents: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [container]

  if (buttons.length > 0) {
    allComponents.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons.slice(0, 5)),
    )
  }
  if (buttons.length > 5) {
    allComponents.push(
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
      allComponents.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`emp_custom_role:${sessionKey}`)
            .setPlaceholder('Manage special roles...')
            .addOptions(options),
        ),
      )
    }
  }

  return { flags: MessageFlags.IsComponentsV2, components: allComponents }
}
