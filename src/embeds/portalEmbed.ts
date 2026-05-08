import {
  ContainerBuilder,
  TextDisplayBuilder,


  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { sep,sepLarge,sepBlank } from '../utils/cv2'
import type { BusinessRecord, RoleMappingRecord, BusinessOwnerRecord } from '../services/portalService'

type PortalViewPayload = {
  flags: number
  components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[]
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export function buildPortalMainMenu(
  businesses: BusinessRecord[],
  sessionKey: string,
  errorMessage?: string,
): PortalViewPayload {
  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  // Header
  const headerLines = ['## Portal — Business Management']
  if (errorMessage) headerLines.push(`\n${errorMessage}`)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerLines.join('\n'))
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  // Business list
  if (businesses.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No businesses configured yet.\nUse **Create Business** to add the first one.')
    )
  } else {
    const lines = businesses.map(
      (b) => `${b.active ? '✅' : '❌'} **${b.name}** · \`${b.slug}\` · ${b.providerType}`
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    )
  }

  // Footer
  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${businesses.length} business${businesses.length === 1 ? '' : 'es'} configured · Sudo mode`
    )
  )

  const components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [container]

  if (businesses.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`portal_biz_select:${sessionKey}`)
          .setPlaceholder('Select a business to manage...')
          .addOptions(
            businesses.slice(0, 25).map((b) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(b.name)
                .setDescription(`${b.active ? 'Active' : 'Inactive'} · ${b.slug}`)
                .setValue(b.id)
            )
          )
      )
    )
  }

  components.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`portal_create:${sessionKey}`)
        .setLabel('Create Business')
        .setStyle(ButtonStyle.Success)
    )
  )

  return { flags: MessageFlags.IsComponentsV2, components }
}

// ---------------------------------------------------------------------------
// Business detail
// ---------------------------------------------------------------------------

export function buildPortalBusinessDetail(
  biz: BusinessRecord,
  owners: BusinessOwnerRecord[],
  roleMappings: RoleMappingRecord[],
  sessionKey: string,
): PortalViewPayload {
  const settings = biz.settings as Record<string, unknown>

  const activeFlags: string[] = []
  if (settings.managersCanPromote) activeFlags.push('Managers Promote')
  if (settings.managersCanAssignCustomRoles) activeFlags.push('Mgrs Custom Roles')
  if (settings.ownersCanManageOwners) activeFlags.push('Owners Manage Owners')
  if (settings.higherRolesAutoGrantEmployee) activeFlags.push('Auto-Grant Employee')
  if (settings.allowOwnerRoleFallback) activeFlags.push('Owner Role Fallback')
  if (settings.apiEnabled) activeFlags.push('API Enabled')

  const container = new ContainerBuilder().setAccentColor(biz.active ? 0x5865f2 : 0x95a5a6)

  // Header
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${biz.name}\n-# \`${biz.slug}\` · ${biz.providerType} · ${biz.active ? '✅ Active' : '❌ Inactive'}`
    )
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  // Stats row
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Owners** · ${owners.length} registered     **Role Mappings** · ${roleMappings.length} configured`
    )
  )

  container.addSeparatorComponents(
    sep()
  )

  // Flags
  const flagsText = activeFlags.length > 0 ? activeFlags.join(' · ') : 'None'
  const apiLine = settings.apiBusinessName ? `\n**API Business Name** · \`${settings.apiBusinessName}\`` : ''
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Active Flags** · ${flagsText}${apiLine}`)
  )

  // Footer
  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ID: \`${biz.id}\` · Sudo mode`)
  )

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`portal_edit:${sessionKey}`)
      .setLabel('Edit Info')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`portal_roles:${sessionKey}`)
      .setLabel('Manage Roles')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`portal_owners:${sessionKey}`)
      .setLabel('Manage Owners')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`portal_perms:${sessionKey}`)
      .setLabel('Permission Flags')
      .setStyle(ButtonStyle.Primary),
  )

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    biz.active
      ? new ButtonBuilder()
          .setCustomId(`portal_deactivate:${sessionKey}`)
          .setLabel('Deactivate')
          .setStyle(ButtonStyle.Danger)
      : new ButtonBuilder()
          .setCustomId(`portal_reactivate:${sessionKey}`)
          .setLabel('Reactivate')
          .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`portal_main:${sessionKey}`)
      .setLabel('← Main Menu')
      .setStyle(ButtonStyle.Secondary),
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, row1, row2] }
}

// ---------------------------------------------------------------------------
// Roles view
// ---------------------------------------------------------------------------

const RANK_LABEL: Record<string, string> = {
  employee: 'Employee',
  manager: 'Manager',
  owner: 'Owner',
}

export function buildPortalRolesView(
  biz: BusinessRecord,
  roleMappings: RoleMappingRecord[],
  sessionKey: string,
): PortalViewPayload {
  const byRank: Record<string, RoleMappingRecord[]> = {
    employee: [],
    manager: [],
    owner: [],
    custom: [],
  }

  for (const m of roleMappings) {
    if (m.rank in RANK_LABEL) {
      byRank[m.rank].push(m)
    } else {
      byRank.custom.push(m)
    }
  }

  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${biz.name} — Role Mappings`)
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  if (roleMappings.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'No role mappings configured.\nAdd roles to enable employee management for this business.'
      )
    )
  } else {
    const lines: string[] = []
    for (const rank of ['employee', 'manager', 'owner'] as const) {
      const entries = byRank[rank]
      if (entries.length === 0) continue
      lines.push(`**${RANK_LABEL[rank]}**`)
      for (const m of entries) {
        const tags: string[] = []
        if (m.isBase) tags.push('base')
        if (m.autoGrantEmployee) tags.push('auto-grant')
        const suffix = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
        const label = m.label ?? m.roleName ?? m.roleId
        lines.push(`· \`${m.roleId}\` — ${label}${suffix}`)
      }
    }
    if (byRank.custom.length > 0) {
      lines.push('**Custom**')
      for (const m of byRank.custom) {
        const label = m.label ?? m.roleName ?? m.roleId
        lines.push(`· \`${m.roleId}\` — ${label} (min: ${m.minRankToAssign})`)
      }
    }
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    )
  }

  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${roleMappings.length} mapping${roleMappings.length === 1 ? '' : 's'} configured · Sudo mode`
    )
  )

  const components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [
    container,
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`portal_add_role:${sessionKey}`)
        .setLabel('Add Role Mapping')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`portal_view:${sessionKey}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  ]

  if (roleMappings.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`portal_rm_role:${sessionKey}`)
          .setPlaceholder('Remove a role mapping...')
          .addOptions(
            roleMappings.slice(0, 25).map((m) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`Remove: ${m.label ?? m.roleName ?? m.roleId}`)
                .setDescription(`${RANK_LABEL[m.rank] ?? m.rank} · ID: ${m.roleId}`)
                .setValue(m.id)
            )
          )
      )
    )
  }

  return { flags: MessageFlags.IsComponentsV2, components }
}

// ---------------------------------------------------------------------------
// Owners view
// ---------------------------------------------------------------------------

export function buildPortalOwnersView(
  biz: BusinessRecord,
  owners: BusinessOwnerRecord[],
  sessionKey: string,
): PortalViewPayload {
  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${biz.name} — Owners`)
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  if (owners.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'No owners registered.\nUse **Add Owner** to designate a Discord user as a business owner.'
      )
    )
  } else {
    const lines = owners.map(
      (o) => `· <@${o.discordUserId}> — added <t:${Math.floor(o.addedAt.getTime() / 1000)}:R>`
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    )
  }

  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${owners.length} owner${owners.length === 1 ? '' : 's'} registered · Sudo mode`
    )
  )

  const components: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [
    container,
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`portal_add_owner:${sessionKey}`)
        .setLabel('Add Owner')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`portal_view:${sessionKey}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  ]

  if (owners.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`portal_rm_owner:${sessionKey}`)
          .setPlaceholder('Remove an owner...')
          .addOptions(
            owners.slice(0, 25).map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`Remove: ${o.discordUserId}`)
                .setDescription(`Added ${o.addedAt.toLocaleDateString()}`)
                .setValue(o.discordUserId)
            )
          )
      )
    )
  }

  return { flags: MessageFlags.IsComponentsV2, components }
}

// ---------------------------------------------------------------------------
// Permissions view
// ---------------------------------------------------------------------------

const FLAG_LABELS: Record<string, string> = {
  managersCanPromote: 'Managers Promote',
  managersCanAssignCustomRoles: 'Mgrs Custom Roles',
  ownersCanManageOwners: 'Owners Manage Owners',
  higherRolesAutoGrantEmployee: 'Auto-Grant Employee',
  allowOwnerRoleFallback: 'Owner Role Fallback',
  apiEnabled: 'API Enabled',
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  managersCanPromote: 'Managers can promote employees to manager rank',
  managersCanAssignCustomRoles: 'Managers can assign custom roles to staff',
  ownersCanManageOwners: 'Owners can add/remove other business owners',
  higherRolesAutoGrantEmployee: 'Having manager/owner role auto-grants the employee role',
  allowOwnerRoleFallback: 'Discord owner role counts as DB ownership',
  apiEnabled: 'Enable McKenzie API integration for this business',
}

const ALL_FLAGS = [
  'managersCanPromote',
  'managersCanAssignCustomRoles',
  'ownersCanManageOwners',
  'higherRolesAutoGrantEmployee',
  'allowOwnerRoleFallback',
  'apiEnabled',
] as const

export function buildPortalPermsView(
  biz: BusinessRecord,
  sessionKey: string,
): PortalViewPayload {
  const settings = biz.settings as Record<string, unknown>

  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${biz.name} — Permission Flags`)
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  const lines = ALL_FLAGS.map(
    (f) => `${Boolean(settings[f]) ? '✅' : '❌'} **${FLAG_LABELS[f]}** — ${FLAG_DESCRIPTIONS[f]}`
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(lines.join('\n'))
  )

  if (settings.apiBusinessName) {
    container.addSeparatorComponents(
      sep()
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**API Business Name** · \`${settings.apiBusinessName}\``)
    )
  }

  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Sudo mode')
  )

  // Button label + color reflect the CURRENT flag state. Clicking still toggles.
  const makeToggle = (flag: string) => {
    const enabled = Boolean(settings[flag])
    return new ButtonBuilder()
      .setCustomId(`portal_toggle:${flag}:${sessionKey}`)
      .setLabel(`${FLAG_LABELS[flag]}: ${enabled ? 'ON' : 'OFF'}`)
      .setEmoji(enabled ? '🟢' : '🔴')
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger)
  }

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    makeToggle('managersCanPromote'),
    makeToggle('managersCanAssignCustomRoles'),
    makeToggle('ownersCanManageOwners'),
  )
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    makeToggle('higherRolesAutoGrantEmployee'),
    makeToggle('allowOwnerRoleFallback'),
    makeToggle('apiEnabled'),
  )
  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`portal_set_api:${sessionKey}`)
      .setLabel('Set API Name')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`portal_view:${sessionKey}`)
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, row1, row2, row3] }
}
