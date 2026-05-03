import { EmbedBuilder } from 'discord.js'

interface TicketCharacter {
  id: string
  name: string
  csn: string | null
  dob: string | null
  phoneNumber: string | null
}

export function buildTicketCharacterEmbed(character: TicketCharacter, discordId: string) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(character.name)
    .setDescription(`<@${discordId}>`)
    .setFooter({ text: 'via Otterbot' })
    .setTimestamp()

  const fields: { name: string; value: string; inline: boolean }[] = []

  if (character.csn) fields.push({ name: 'CSN', value: character.csn, inline: true })
  if (character.dob) fields.push({ name: 'Date of Birth', value: character.dob, inline: true })
  if (character.phoneNumber) fields.push({ name: 'Phone', value: character.phoneNumber, inline: true })

  if (fields.length > 0) embed.addFields(fields)

  return { embeds: [embed], components: [] }
}
