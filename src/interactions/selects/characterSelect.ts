import type { StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { getProvider } from '../../services/businessService'
import { showCharacterEmbed } from '../../commands/lookup'

export async function handleCharacterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return

  await interaction.deferUpdate()

  // customId: lookup_char_select:{businessId}:{targetDiscordId}
  const parts = interaction.customId.split(':')
  // UUID contains hyphens but no colons, so split gives: [prefix, businessId, targetDiscordId]
  // However UUID is 36 chars with hyphens — join parts 1 and 2 is wrong since there's only 3 parts.
  // Format: "lookup_char_select:{uuid}:{snowflake}" — 3 parts after split on ':'
  const businessId = parts[1]
  const targetDiscordId = parts[2]

  if (!businessId || !targetDiscordId) {
    await interaction.editReply({ content: 'Invalid interaction data.', components: [] })
    return
  }

  const selectedCharacterId = interaction.values[0]
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const chosen = resolved.find((r) => r.business.id === businessId)

  if (!chosen) {
    await interaction.editReply({ content: 'You no longer have access to that business.', components: [] })
    return
  }

  // Re-fetch all characters and find the selected one
  const provider = getProvider(chosen.business)
  let characters
  try {
    characters = await provider.lookupByDiscordId(targetDiscordId)
  } catch {
    await interaction.editReply({ content: 'Could not reach the API. Try again in a moment.', components: [] })
    return
  }

  const character = characters.find((c) => c.id === selectedCharacterId)
  if (!character) {
    await interaction.editReply({ content: 'Character no longer found. Try running /lookup again.', components: [] })
    return
  }

  await showCharacterEmbed(interaction, chosen, character, targetDiscordId)
}
