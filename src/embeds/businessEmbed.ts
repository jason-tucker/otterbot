import { EmbedBuilder } from 'discord.js'
import type { BusinessRoster } from '../services/providers/IBusinessProvider'

interface BusinessInfo {
  name: string
  providerType: 'mckenzie' | 'discord-only'
}

export function buildBusinessEmbed(info: BusinessInfo, roster: BusinessRoster | null) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(roster?.businessName ?? info.name)
    .setFooter({ text: 'via Otterbot' })
    .setTimestamp()

  if (!roster) {
    embed.setDescription('Could not reach the API. Try again in a moment.')
    return { embeds: [embed], components: [] }
  }

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

  return { embeds: [embed], components: [] }
}
