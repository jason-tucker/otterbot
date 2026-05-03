import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import type { BusinessRecord, RoleMappingRecord, BusinessOwnerRecord } from '../services/portalService'

type PortalViewPayload = {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
  content?: string
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export function buildPortalMainMenu(
  businesses: BusinessRecord[],
  sessionKey: string,
  errorMessage?: string,
): PortalViewPayload {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Portal — Business Management')
    .setDescription(
      businesses.length === 0
        ? 'No businesses configured. Create one to get started.'
        : `**${businesses.length}** business${businesses.length === 1 ? '' : 'es'} configured.\nSelect one to manage it, or create a new one.`,
    )
    .addFields({
      name: 'Businesses',
      value:
        businesses.length === 0
          ? 'None'
          : businesses
              .map((b) => `${b.active ? '✅' : '❌'} **${b.name}** (\`${b.slug}\`)`)
              .join('\n'),
    })
    .setFooter({ text: 'Sudo mode' })
    .setTimestamp()

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

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
                .setValue(b.id),
            ),
          ),
      ),
    )
  }

  components.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`portal_create:${sessionKey}`)
        .setLabel('Create Business')
        .setStyle(ButtonStyle.Success),
    ),
  )

  return { embeds: [embed], components, content: errorMessage ?? null! }
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
  if (settings.managersCanPromote) activeFlags.push('managersCanPromote')
  if (settings.managersCanAssignCustomRoles) activeFlags.push('managersCanAssignCustomRoles')
  if (settings.ownersCanManageOwners) activeFlags.push('ownersCanManageOwners')
  if (settings.higherRolesAutoGrantEmployee) activeFlags.push('higherRolesAutoGrantEmployee')
  if (settings.allowOwnerRoleFallback) activeFlags.push('allowOwnerRoleFallback')
  if (settings.apiEnabled) activeFlags.push('apiEnabled')

  const embed = new EmbedBuilder()
    .setColor(biz.active ? 0x5865f2 : 0x95a5a6)
    .setTitle(biz.name)
    .addFields(
      { name: 'Slug', value: `\`${biz.slug}\``, inline: true },
      { name: 'Provider', value: biz.providerType, inline: true },
      { name: 'Status', value: biz.active ? '✅ Active' : '❌ Inactive', inline: true },
      { name: 'Owners', value: `${owners.length} registered`, inline: true },
      { name: 'Role Mappings', value: `${roleMappings.length} configured`, inline: true },
      { name: 'Active Flags', value: activeFlags.length > 0 ? activeFlags.join(', ') : 'None', inline: true },
    )
    .setFooter({ text: `ID: ${biz.id}` })
    .setTimestamp()

  if (settings.apiBusinessName) {
    embed.addFields({ name: 'API Business Name', value: String(settings.apiBusinessName), inline: true })
  }

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
          .setLabel('Deactivate Business')
          .setStyle(ButtonStyle.Danger)
      : new ButtonBuilder()
          .setCustomId(`portal_reactivate:${sessionKey}`)
          .setLabel('Reactivate Business')
          .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`portal_main:${sessionKey}`)
      .setLabel('← Main Menu')
      .setStyle(ButtonStyle.Secondary),
  )

  return { embeds: [embed], components: [row1, row2] }
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
      const displayLabel = m.label ?? m.roleName ?? m.roleId
      lines.push(`• \`${m.roleId}\` — ${displayLabel}${suffix}`)
    }
  }
  if (byRank.custom.length > 0) {
    lines.push('**Custom**')
    for (const m of byRank.custom) {
      const displayLabel = m.label ?? m.roleName ?? m.roleId
      lines.push(`• \`${m.roleId}\` — ${displayLabel} (min: ${m.minRankToAssign})`)
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${biz.name} — Role Mappings`)
    .setDescription(
      roleMappings.length === 0
        ? 'No role mappings configured. Add roles to enable employee management.'
        : lines.join('\n'),
    )
    .setFooter({ text: `${roleMappings.length} mapping${roleMappings.length === 1 ? '' : 's'} configured` })
    .setTimestamp()

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

  components.push(
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
  )

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
                .setValue(m.id),
            ),
          ),
      ),
    )
  }

  return { embeds: [embed], components }
}

// ---------------------------------------------------------------------------
// Owners view
// ---------------------------------------------------------------------------

export function buildPortalOwnersView(
  biz: BusinessRecord,
  owners: BusinessOwnerRecord[],
  sessionKey: string,
): PortalViewPayload {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${biz.name} — Owners`)
    .setDescription(
      owners.length === 0
        ? 'No owners registered. Use "Add Owner" to designate a Discord user as a business owner.'
        : owners
            .map((o) => `• <@${o.discordUserId}> — added <t:${Math.floor(o.addedAt.getTime() / 1000)}:R>`)
            .join('\n'),
    )
    .setFooter({ text: `${owners.length} owner${owners.length === 1 ? '' : 's'} registered` })
    .setTimestamp()

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []

  components.push(
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
  )

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
                .setValue(o.discordUserId),
            ),
          ),
      ),
    )
  }

  return { embeds: [embed], components }
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

  const lines = ALL_FLAGS.map(
    (f) => `${Boolean(settings[f]) ? '✅' : '❌'} **${FLAG_LABELS[f]}** — ${FLAG_DESCRIPTIONS[f]}`,
  )
  const apiNameLine = settings.apiBusinessName
    ? `\n\n**API Business Name:** ${settings.apiBusinessName}`
    : ''

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${biz.name} — Permission Flags`)
    .setDescription(lines.join('\n') + apiNameLine)
    .setTimestamp()

  const makeToggle = (flag: string) =>
    new ButtonBuilder()
      .setCustomId(`portal_toggle:${flag}:${sessionKey}`)
      .setLabel(FLAG_LABELS[flag])
      .setStyle(Boolean(settings[flag]) ? ButtonStyle.Success : ButtonStyle.Secondary)

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

  return { embeds: [embed], components: [row1, row2, row3] }
}
