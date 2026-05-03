import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js'

interface TicketCharacter {
  id: string
  name: string
  csn: string | null
  dob: string | null
  phoneNumber: string | null
  bankNumber: string | null
}

export function buildTicketCharacterEmbed(character: TicketCharacter, discordId: string) {
  const fields: string[] = []
  if (character.csn) fields.push(`**CSN** · \`${character.csn}\``)
  if (character.dob) fields.push(`**Date of Birth** · \`${character.dob}\``)
  if (character.phoneNumber) fields.push(`**Phone** · \`${character.phoneNumber}\``)
  if (character.bankNumber) fields.push(`**Bank** · \`${character.bankNumber}\``)

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${character.name}\n<@${discordId}>`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
    )

  if (fields.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fields.join('\n'))
    )
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# via Otterbot')
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  }
}
