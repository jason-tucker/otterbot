import { type StringSelectMenuInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { getStockById } from '../../services/ocStockService'
import { buildOCEditItemEmbed } from '../../embeds/ocEmbed'

export async function handleOCItemSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate()

  if (!interaction.guild) return
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')

  if (!oc || !hasMinRank(oc.rank, 'manager')) {
    await interaction.editReply({ content: 'You do not have permission to manage OC stock.' })
    return
  }

  const itemId = interaction.values[0]
  const item = await getStockById(itemId)

  if (!item) {
    await interaction.editReply({ content: 'That item no longer exists. Refresh with the Back button.' })
    return
  }

  await interaction.editReply({ ...buildOCEditItemEmbed(item), content: null } as any)
}
