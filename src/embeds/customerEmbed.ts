import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { Character, Business, StaffRank, CustomerStanding } from '../types/domain'
import { STANDING_COLORS } from '../types/domain'
import { registerSendable } from '../utils/sendable'

export function buildCustomerEmbed(
  character: Character,
  business: Business,
  standing: CustomerStanding | null,
  rank: StaffRank,
  linkedDiscordId: string | null,
  notesCount: number,
  sessionKey: string
) {
  const currentStanding = standing?.standing ?? 'neutral'
  const color = STANDING_COLORS[currentStanding]

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(character.name)
    .setFooter({ text: `${business.name} • via Otterbot` })
    .setTimestamp()

  if (linkedDiscordId) embed.setDescription(`<@${linkedDiscordId}>`)

  const fields: { name: string; value: string; inline: boolean }[] = []

  if (character.csn) fields.push({ name: 'CSN', value: character.csn, inline: true })
  if (character.dob) fields.push({ name: 'Date of Birth', value: character.dob, inline: true })
  if (character.phoneNumber) fields.push({ name: 'Phone', value: character.phoneNumber, inline: true })

  fields.push({
    name: 'Standing',
    value: `${standingEmoji(currentStanding)} ${capitalize(currentStanding)}${standing?.reason ? ` — ${standing.reason}` : ''}`,
    inline: true,
  })

  fields.push({
    name: 'Notes on Record',
    value: notesCount === 0 ? 'None' : `${notesCount} note${notesCount === 1 ? '' : 's'}`,
    inline: true,
  })

  if (character.securityRiskLevel > 0) {
    fields.push({
      name: '⚠️ Security Risk',
      value: `Level ${character.securityRiskLevel}${character.securityRiskInfo?.reason ? `: ${character.securityRiskInfo.reason}` : ''}`,
      inline: false,
    })
  }

  embed.addFields(fields)

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`note_add:${sessionKey}`)
      .setLabel('Add Note')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(`note_view:${sessionKey}`)
      .setLabel('View Notes')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  )

  if (rank === 'manager' || rank === 'owner') {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`standing_change:${sessionKey}`)
        .setLabel('Change Standing')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚖️')
    )
  }

  const sendKey = `lookup:${sessionKey}`
  registerSendable(sendKey, () => ({ embeds: [embed] }))

  const sendRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_to_channel:${sendKey}`)
      .setLabel('Send to Channel')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Secondary)
  )

  return { embeds: [embed], components: [buttons, sendRow] }
}

function standingEmoji(standing: string): string {
  switch (standing) {
    case 'good': return '🟢'
    case 'neutral': return '⚪'
    case 'bad': return '🟠'
    case 'blacklisted': return '🔴'
    default: return '⚪'
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
