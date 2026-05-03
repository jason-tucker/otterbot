import { ContainerBuilder, TextDisplayBuilder, MessageFlags, type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { runLookup } from '../../commands/lookup'

export async function handleBusinessSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return

  await interaction.deferUpdate()

  const targetDiscordId = interaction.customId.split(':')[1]
  if (!targetDiscordId) {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid interaction data.'))],
    })
    return
  }

  const selectedBusinessId = interaction.values[0]
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const chosen = resolved.find((r) => r.business.id === selectedBusinessId)

  if (!chosen) {
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [new ContainerBuilder().setAccentColor(0x95a5a6).addTextDisplayComponents(new TextDisplayBuilder().setContent('You no longer have access to that business.'))],
    })
    return
  }

  let targetUsername = targetDiscordId
  try {
    const targetUser = await interaction.client.users.fetch(targetDiscordId)
    targetUsername = targetUser.username
  } catch {
    // fall back to ID
  }

  await runLookup(interaction, chosen, targetDiscordId, targetUsername)
}
