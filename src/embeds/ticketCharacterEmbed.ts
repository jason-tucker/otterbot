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

interface TicketCharacter {
  id: string
  name: string
  csn: string | null
  phoneNumber: string | null
  bankNumber: string | null
}

export type LookupMethod = 'discord' | 'csn' | 'phone' | 'manual'

function lookupMethodLabel(method: LookupMethod): string {
  switch (method) {
    case 'discord': return 'Discord link'
    case 'csn': return 'CSN'
    case 'phone': return 'Phone number'
    case 'manual': return 'Manual'
  }
}

export function buildTicketCharacterEmbed(
  character: TicketCharacter,
  discordId: string,
  options: { sessionKey?: string; lookupMethod?: LookupMethod } = {}
) {
  const { sessionKey, lookupMethod = 'discord' } = options

  const fields: string[] = []
  if (character.csn) fields.push(`**CSN** · \`${character.csn}\``)
  if (character.phoneNumber) fields.push(`**Phone** · \`${character.phoneNumber}\``)
  if (character.bankNumber) fields.push(`**Bank** · \`${character.bankNumber}\``)
  fields.push(`**Lookup Method** · ${lookupMethodLabel(lookupMethod)}`)

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${character.name}\n<@${discordId}>`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fields.join('\n'))
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# via Otterbot')
    )

  const components: any[] = [container]

  if (sessionKey) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`note_view:${sessionKey}`)
          .setLabel('View Notes')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋'),
        new ButtonBuilder()
          .setCustomId(`note_add:${sessionKey}`)
          .setLabel('Add Note')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝')
      )
    )
  }

  return {
    components,
    flags: MessageFlags.IsComponentsV2,
  }
}
