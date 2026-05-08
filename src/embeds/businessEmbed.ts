import {
  ContainerBuilder,
  TextDisplayBuilder,


  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { sep,sepLarge,sepBlank } from '../utils/cv2'
import { randomUUID } from 'crypto'
import type { BusinessRoster, RosterMember } from '../services/providers/IBusinessProvider'
import { registerSendable } from '../utils/sendable'

function formatRosterMember(m: RosterMember, includeDiscord: boolean): string {
  const parts: string[] = []
  if (m.csn) parts.push(`CSN \`${m.csn}\``)
  if (m.character.phoneNumber) parts.push(`📞 \`${m.character.phoneNumber}\``)
  if (m.character.bankNumber) parts.push(`🏦 \`${m.character.bankNumber}\``)
  if (includeDiscord && m.discordId) parts.push(`<@${m.discordId}>`)
  return `**${m.name}**${parts.length ? ' — ' + parts.join(' · ') : ''}`
}

interface BusinessInfo {
  name: string
  providerType: 'mckenzie' | 'discord-only'
}

export function buildBusinessEmbed(info: BusinessInfo, roster: BusinessRoster | null, sessionKey?: string) {
  if (!roster) {
    const container = new ContainerBuilder()
      .setAccentColor(0x95a5a6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${info.name}\n⚠️ Could not reach the API. Try again in a moment.`)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# via Otterbot')
      )
    return { flags: MessageFlags.IsComponentsV2, components: [container] as any[] }
  }

  const employees = roster.members.filter((m) => m.role === 'employee')
  const owner = roster.members.find((m) => m.role === 'owner')

  const container = new ContainerBuilder().setAccentColor(0x5865f2)

  // Header
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${roster.businessName}`)
  )

  container.addSeparatorComponents(
    sepLarge()
  )

  // Owner + count
  const ownerText = owner ? formatRosterMember(owner, true) : 'Unknown'
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Owner** · ${ownerText}\n**Total Employees** · ${employees.length}`
    )
  )

  // Roster
  if (employees.length > 0) {
    container.addSeparatorComponents(
      sep()
    )
    const shown = employees.slice(0, 20)
    const lines = shown.map((e) => `· ${formatRosterMember(e, false)}`)
    if (employees.length > 20) lines.push(`-# … and ${employees.length - 20} more not shown`)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Roster\n${lines.join('\n')}`)
    )
  } else if (info.providerType === 'discord-only') {
    container.addSeparatorComponents(
      sepBlank()
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Roster management coming soon for this business.')
    )
  }

  // Footer
  container.addSeparatorComponents(
    sepBlank()
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# via Otterbot')
  )

  const sendKey = `business:${randomUUID()}`
  registerSendable(sendKey, () => ({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  }))

  const actionRows: ActionRowBuilder<ButtonBuilder>[] = []

  if (sessionKey && roster.members.length > 0) {
    actionRows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`business_lookup:${sessionKey}`)
          .setLabel('Lookup Employee')
          .setEmoji('🔍')
          .setStyle(ButtonStyle.Secondary)
      )
    )
  }

  actionRows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`send_to_channel:${sendKey}`)
        .setLabel('Send to Channel')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary)
    )
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container, ...actionRows] as any[] }
}
