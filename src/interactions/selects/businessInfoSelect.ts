import type { StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses } from '../../services/permissionService'
import { showBusiness } from '../../commands/business'

export async function handleBusinessInfoSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return

  await interaction.deferUpdate()

  const selectedBusinessId = interaction.values[0]
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const chosen = resolved.find((r) => r.business.id === selectedBusinessId)

  if (!chosen) {
    await interaction.editReply({ content: 'You no longer have access to that business.', components: [] })
    return
  }

  await showBusiness(
    interaction as unknown as import('discord.js').ChatInputCommandInteraction,
    chosen
  )
}
