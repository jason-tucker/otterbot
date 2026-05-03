import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import type { Character, Business, StaffRank, CustomerStanding, Standing } from '../types/domain'
import { STANDING_COLORS } from '../types/domain'
import { registerSendable } from '../utils/sendable'

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

function buildInfoContainer(
  character: Character,
  business: Business,
  standing: CustomerStanding | null,
  linkedDiscordId: string | null,
  notesCount: number,
): ContainerBuilder {
  const currentStanding = standing?.standing ?? 'neutral'
  const accent = STANDING_COLORS[currentStanding as Standing] ?? 0x95a5a6

  const container = new ContainerBuilder().setAccentColor(accent)

  // Header
  const header = linkedDiscordId
    ? `## ${character.name}\n<@${linkedDiscordId}>`
    : `## ${character.name}\n-# No Discord account linked`
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header))

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
  )

  // Character fields
  const fields: string[] = []
  if (character.csn) fields.push(`**CSN** · \`${character.csn}\``)
  if (character.dob) fields.push(`**Date of Birth** · \`${character.dob}\``)
  if (character.phoneNumber) fields.push(`**Phone** · \`${character.phoneNumber}\``)
  if (character.bankNumber) fields.push(`**Bank** · \`${character.bankNumber}\``)

  if (fields.length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.join('\n')))
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
  }

  // Standing + notes
  const standingLabel = `${standingEmoji(currentStanding)} **${capitalize(currentStanding)}**${standing?.reason ? ` — ${standing.reason}` : ''}`
  const notesLabel = notesCount === 0 ? 'None' : `${notesCount} note${notesCount === 1 ? '' : 's'}`
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Standing** · ${standingLabel}\n**Notes on Record** · ${notesLabel}`
    )
  )

  // Security risk
  if (character.securityRiskLevel > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    const riskDetail = character.securityRiskInfo?.reason
      ? `\n${character.securityRiskInfo.reason}`
      : ''
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `⚠️ **Security Risk — Level ${character.securityRiskLevel}**${riskDetail}`
      )
    )
  }

  // Footer
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${business.name} · via Otterbot`)
  )

  return container
}

export function buildCustomerEmbed(
  character: Character,
  business: Business,
  standing: CustomerStanding | null,
  rank: StaffRank,
  linkedDiscordId: string | null,
  notesCount: number,
  sessionKey: string
) {
  const infoContainer = buildInfoContainer(character, business, standing, linkedDiscordId, notesCount)

  const sendKey = `lookup:${sessionKey}`
  registerSendable(sendKey, () => ({
    components: [infoContainer],
    flags: MessageFlags.IsComponentsV2,
  }))

  const staffButtons = [
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
  ]

  if (rank === 'manager' || rank === 'owner') {
    staffButtons.push(
      new ButtonBuilder()
        .setCustomId(`standing_change:${sessionKey}`)
        .setLabel('Change Standing')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚖️')
    )
  }

  const staffRow = new ActionRowBuilder<ButtonBuilder>().addComponents(staffButtons)

  const sendRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_to_channel:${sendKey}`)
      .setLabel('Send to Channel')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Secondary)
  )

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [infoContainer, staffRow, sendRow],
  }
}
