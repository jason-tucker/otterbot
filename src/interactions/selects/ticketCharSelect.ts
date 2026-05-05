import type { StringSelectMenuInteraction } from 'discord.js'
import { env } from '../../config/env'
import { buildTicketCharacterEmbed } from '../../embeds/ticketCharacterEmbed'

interface MkCharacterProfile {
  id: string
  status: boolean
  name: string
  csn: string
  dob: string | null
  phoneNumber: string
  bankNumber: string
}

async function fetchCharacters(discordId: string) {
  const res = await fetch(
    `${env.EUPHORIC_API_BASE_URL}/character-profiles/discord/${encodeURIComponent(discordId)}`,
    { headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }, signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []
  const data = await res.json() as MkCharacterProfile[]
  if (!Array.isArray(data)) return []
  return data.filter((p) => p.status).map((p) => ({
    id: p.id,
    name: p.name,
    csn: p.csn || null,
    dob: p.dob,
    phoneNumber: p.phoneNumber || null,
    bankNumber: p.bankNumber || null,
  }))
}

export async function handleTicketCharSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate()

  const targetDiscordId = interaction.customId.slice('ticket_char_select:'.length)
  const selectedCharacterId = interaction.values[0]

  let characters: Awaited<ReturnType<typeof fetchCharacters>>
  try {
    characters = await fetchCharacters(targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'Could not reach the MKE API. Try again in a moment.', components: [] })
    return
  }

  const character = characters.find((c) => c.id === selectedCharacterId)
  if (!character) {
    await interaction.editReply({ content: 'Character not found. Please try again.', components: [] })
    return
  }

  await interaction.editReply(buildTicketCharacterEmbed(character, targetDiscordId) as any)
}
