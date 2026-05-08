import {
  ContainerBuilder,
  TextDisplayBuilder,


  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { sep,sepLarge,sepBlank } from '../utils/cv2'
import type { Character, Business, StaffRank, CustomerStanding, Standing } from '../types/domain'
import { STANDING_COLORS } from '../types/domain'
import { registerSendable } from '../utils/sendable'

export type ViewerMode = 'staff' | 'self'

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

function nameNode(character: Character): string {
  return character.source === 'mckenzie_api'
    ? `[${character.name}](https://mke.euphoric.gg/employee/portal/customers/view/${character.id})`
    : character.name
}

export interface BusinessAccountsInfo {
  matchedBusinesses: { id: string; name: string }[]
  unknownBusinessCount: number
}

function buildInfoContainer(
  character: Character,
  business: Business,
  standing: CustomerStanding | null,
  linkedDiscordId: string | null,
  notesCount: number,
  options: { hideNotes?: boolean; businessAccounts?: BusinessAccountsInfo } = {},
): ContainerBuilder {
  const currentStanding = standing?.standing ?? 'neutral'
  const accent = STANDING_COLORS[currentStanding as Standing] ?? 0x95a5a6

  const container = new ContainerBuilder().setAccentColor(accent)

  const header = linkedDiscordId
    ? `## ${nameNode(character)}\n<@${linkedDiscordId}>`
    : `## ${nameNode(character)}\n-# No Discord account linked`
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header))

  container.addSeparatorComponents(
    sepLarge()
  )

  const fields: string[] = []
  if (character.csn) fields.push(`**CSN** · \`${character.csn}\``)
  if (character.dob) fields.push(`**Date of Birth** · \`${character.dob}\``)
  if (character.phoneNumber) fields.push(`**Phone** · \`${character.phoneNumber}\``)
  if (character.bankNumber) fields.push(`**Bank** · \`${character.bankNumber}\``)

  if (fields.length > 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.join('\n')))
    container.addSeparatorComponents(
      sep()
    )
  }

  const standingLabel = `${standingEmoji(currentStanding)} **${capitalize(currentStanding)}**${standing?.reason ? ` — ${standing.reason}` : ''}`
  const lines = [`**Standing** · ${standingLabel}`]
  if (!options.hideNotes) {
    const notesLabel = notesCount === 0 ? 'None' : `${notesCount} note${notesCount === 1 ? '' : 's'}`
    lines.push(`**Notes on Record** · ${notesLabel}`)
  }

  const ba = options.businessAccounts
  if (ba && (ba.matchedBusinesses.length > 0 || ba.unknownBusinessCount > 0)) {
    const total = ba.matchedBusinesses.length + ba.unknownBusinessCount
    const parts: string[] = []
    if (ba.matchedBusinesses.length > 0) {
      parts.push(ba.matchedBusinesses.map((b) => b.name).join(', '))
    }
    if (ba.unknownBusinessCount > 0) {
      parts.push(`${ba.unknownBusinessCount} other${ba.unknownBusinessCount === 1 ? '' : 's'}`)
    }
    lines.push(`**Business Accounts** · ${total} on file — ${parts.join(' · ')}`)
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))

  if (character.securityRiskLevel > 0) {
    container.addSeparatorComponents(
      sep()
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

  container.addSeparatorComponents(
    sepBlank()
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
  sessionKey: string,
  viewerMode: ViewerMode = 'staff',
  businessAccounts?: BusinessAccountsInfo,
) {
  const infoContainer = buildInfoContainer(character, business, standing, linkedDiscordId, notesCount, { businessAccounts })

  // Public broadcast hides the notes count — keep contact info, drop notes.
  const sendKey = `lookup:${sessionKey}`
  registerSendable(sendKey, () => ({
    components: [buildInfoContainer(character, business, standing, linkedDiscordId, notesCount, { hideNotes: true, businessAccounts })],
    flags: MessageFlags.IsComponentsV2,
  }))

  const components: any[] = [infoContainer]

  if (viewerMode === 'staff') {
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

    // "Change Standing" removed in 0.9.1 — standing now derives from the most
    // recent MKE Good/Bad Experience marker. The bot can't POST markers to MKE
    // (employee-gated), so a local override would just be misleading.

    // Surface a Search Business button only when at least one of the
    // character's business accounts couldn't be resolved to a known business.
    if (businessAccounts && businessAccounts.unknownBusinessCount > 0) {
      staffButtons.push(
        new ButtonBuilder()
          .setCustomId(`business_search:${sessionKey}`)
          .setLabel('Search Business')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔎')
      )
    }

    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(staffButtons))
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`send_to_channel:${sendKey}`)
        .setLabel('Send to Channel')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary)
    )
  )

  return {
    flags: MessageFlags.IsComponentsV2,
    components,
  }
}
