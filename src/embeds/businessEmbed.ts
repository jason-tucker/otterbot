import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { randomUUID } from 'crypto'
import type { BusinessRoster } from '../services/providers/IBusinessProvider'
import { registerSendable } from '../utils/sendable'

interface BusinessInfo {
  name: string
  providerType: 'mckenzie' | 'discord-only'
}

export function buildBusinessEmbed(info: BusinessInfo, roster: BusinessRoster | null, sessionKey?: string) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(roster?.businessName ?? info.name)
    .setFooter({ text: 'via Otterbot' })
    .setTimestamp()

  if (!roster) {
    embed.setDescription('Could not reach the API. Try again in a moment.')
    return { embeds: [embed], components: [] }
  }

  const sendKey = `business:${randomUUID()}`

  const employees = roster.members.filter((m) => m.role === 'employee')
  const owner = roster.members.find((m) => m.role === 'owner')

  embed.addFields(
    {
      name: 'Owner',
      value: owner ? `${owner.name}${owner.csn ? ` (${owner.csn})` : ''}` : 'Unknown',
      inline: true,
    },
    {
      name: 'Employees',
      value: `${employees.length}`,
      inline: true,
    }
  )

  if (employees.length > 0) {
    const shown = employees.slice(0, 20)
    const lines = shown.map((e) => `• ${e.name}${e.csn ? ` — ${e.csn}` : ''}`)
    if (employees.length > 20) lines.push(`… and ${employees.length - 20} more`)

    embed.addFields({
      name: 'Roster',
      value: lines.join('\n'),
      inline: false,
    })
  } else if (info.providerType === 'discord-only') {
    embed.addFields({
      name: 'Roster',
      value: 'Roster management coming soon for non-API businesses.',
      inline: false,
    })
  }

  registerSendable(sendKey, () => ({ embeds: [embed] }))

  const sendRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_to_channel:${sendKey}`)
      .setLabel('Send to Channel')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Secondary)
  )

  const components: ActionRowBuilder<ButtonBuilder>[] = []

  if (sessionKey && roster.members.length > 0) {
    const lookupRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`business_lookup:${sessionKey}`)
        .setLabel('Lookup Employee')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary)
    )
    components.push(lookupRow)
  }

  components.push(sendRow)

  return { embeds: [embed], components }
}
