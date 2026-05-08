import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js'
import { resolveBusinesses } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { cmd } from '../utils/cmdMention'
import { sep } from '../utils/cv2'
import type { ResolvedBusiness } from '../types/domain'

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show available commands based on your role')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const admin = isSudoUser(member)
  const guildId = interaction.guildId!

  const isStaff = resolved.length > 0
  const isManagerPlus = resolved.some((r) => r.rank === 'manager' || r.rank === 'owner')
  const isOCManager = resolved.some(
    (r) => r.business.slug === 'original-clothing' && (r.rank === 'manager' || r.rank === 'owner')
  )

  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Otterbot — Available Commands')
  )

  // ── Public / reference ───────────────────────────────────────────────────
  container.addSeparatorComponents(sep())
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '### Public',
        `${cmd('oc', guildId)} — Original Clothing stock, requirements, and product links`,
        `${cmd('caked', guildId)} — Caked Up order info, pricing, and intake forms`,
        `${cmd('printinfo', guildId)} — McKenzie Enterprises printing reference`,
        `${cmd('artsize', guildId)} — Art commission size reference`,
        `${cmd('tcsheet', guildId)} — Trading card sheet reference`,
        `${cmd('report', guildId)} — File a bug or feature request (owner-reviewed → GitHub issue)`,
        `${cmd('help', guildId)} — This menu`,
      ].join('\n')
    )
  )

  // ── Staff ────────────────────────────────────────────────────────────────
  if (isStaff) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### Staff',
          `${cmd('lookup', guildId)} — Look up a Discord user's characters, standing, and notes`,
          `Right-click a user → Apps → **Lookup** for a quick shortcut`,
          `${cmd('business', guildId)} — Search a business roster; staff of that business can look up any employee directly`,
          `**Auto-Ticket helper** — When Ticket Tool opens a ticket and pings a user, otterbot auto-runs the MKE lookup. If the user has no character, the bot posts an **Account Made** button (4-min per-user cooldown). On click, it re-runs the lookup; if still nothing, the user gets an ephemeral with **Website**, **Ask for Help**, and **Retry** buttons.`,
        ].join('\n')
      )
    )
  }

  // ── Manager+ ─────────────────────────────────────────────────────────────
  if (isManagerPlus) {
    const managerLines = [
      '### Manager',
      `${cmd('employee', guildId)} — Hire, fire, promote, and demote employees`,
      `Right-click a user → Apps → **Manage Employee** for a quick shortcut`,
      `${cmd('movechannel', guildId)} — Move the current ticket channel to a different category`,
      `**Add / View Notes** — Attach internal notes; standing auto-derives from the customer's most recent MKE Good/Bad Experience marker`,
    ]

    if (isOCManager) {
      managerLines.push(`**Manage Stock** — Update OC clothing item statuses and product links via ${cmd('oc', guildId)}`)
    }

    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(managerLines.join('\n'))
    )
  }

  // ── Sudo ─────────────────────────────────────────────────────────────────
  if (admin) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### Admin',
          `${cmd('portal', guildId)} — Create and manage businesses, role mappings, and owners`,
          `**Make / Revoke Owner** — Grant or remove DB-authoritative ownership from any employee embed`,
        ].join('\n')
      )
    )
  }

  // ── Business access summary ───────────────────────────────────────────────
  if (resolved.length > 0) {
    container.addSeparatorComponents(sep())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### Your Access',
          ...resolved.map((r: ResolvedBusiness) => `- **${r.business.name}** — ${capitalize(r.rank)}`),
        ].join('\n')
      )
    )
  }

  // Select menu for interactive section drill-down
  const sections = [
    { label: 'Public commands', value: 'public', emoji: '🌐', description: '/oc, /caked, /printinfo and more' },
    ...(isStaff ? [{ label: 'Staff commands', value: 'staff', emoji: '👔', description: '/lookup, /business, notes and standing' }] : []),
    ...(isManagerPlus ? [{ label: 'Manager commands', value: 'manager', emoji: '⚙️', description: '/employee, /movechannel, OC stock' }] : []),
    ...(admin ? [{ label: 'Admin commands', value: 'admin', emoji: '🛡️', description: '/portal and ownership controls' }] : []),
    { label: 'Your access', value: 'access', emoji: '🔑', description: 'See your business roles' },
  ]

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help:section')
      .setPlaceholder('Dive deeper into a section...')
      .addOptions(sections)
  )

  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [container, selectRow], content: null })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
