import { type ModalSubmitInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { addStockItem, getAllStock } from '../../services/ocStockService'
import { auditSafe } from '../../services/auditService'
import { buildOCManageEmbed } from '../../embeds/ocEmbed'

export async function handleOCAddSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) return

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')

  if (!oc || !hasMinRank(oc.rank, 'manager')) {
    await interaction.reply({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
    return
  }

  const name = interaction.fields.getTextInputValue('item_name').trim()
  if (!name) {
    await interaction.reply({ content: 'Item name cannot be empty.', ephemeral: true })
    return
  }

  await addStockItem(name, interaction.user.id)
  await auditSafe({
    actorDiscordId: interaction.user.id,
    actorName: interaction.user.username,
    businessId: oc.business.id,
    action: 'oc_stock_add',
    targetType: 'oc_stock',
    details: { name },
  })
  const items = await getAllStock()

  if (interaction.isFromMessage()) {
    await interaction.update({ ...buildOCManageEmbed(items), content: null } as any)
  } else {
    await interaction.reply({ ...buildOCManageEmbed(items), ephemeral: true } as any)
  }
}
