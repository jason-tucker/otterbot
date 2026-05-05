import { ContainerBuilder, TextDisplayBuilder, MessageFlags, type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { getProvider } from '../../services/businessService'
import { showCharacterEmbed } from '../../commands/lookup'

function v2Error(msg: string) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(msg)
      ),
    ] as any[],
  }
}

export async function handleCharacterSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return

  await interaction.deferUpdate()

  const parts = interaction.customId.split(':')
  const businessId = parts[1]
  const targetDiscordId = parts[2]

  if (!businessId || !targetDiscordId) {
    await interaction.editReply(v2Error('Invalid interaction data.') as any)
    return
  }

  const selectedCharacterId = interaction.values[0]
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const chosen = resolved.find((r) => r.business.id === businessId)

  if (!chosen) {
    await interaction.editReply(v2Error('You no longer have access to that business.') as any)
    return
  }

  const provider = getProvider(chosen.business)
  let characters
  try {
    characters = await provider.lookupByDiscordId(targetDiscordId)
  } catch {
    await interaction.editReply(v2Error('Could not reach the API. Try again in a moment.') as any)
    return
  }

  const character = characters.find((c) => c.id === selectedCharacterId)
  if (!character) {
    await interaction.editReply(v2Error('Character no longer found. Try running /lookup again.') as any)
    return
  }

  await showCharacterEmbed(interaction, chosen, character, targetDiscordId)
}
