import { type ButtonInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { getAllStock, getStockById, updateStockStatus, removeStockItem } from '../../services/ocStockService'
import { buildOCManageEmbed, buildOCEditItemEmbed, buildOCAddModal, buildOCUrlModal } from '../../embeds/ocEmbed'
import type { OcStockStatus } from '../../services/ocStockService'

async function requireOCManager(interaction: ButtonInteraction) {
  if (!interaction.guild) return null
  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')
  return oc && hasMinRank(oc.rank, 'manager') ? oc : null
}

export async function handleOCButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId

  // ── Open management panel from the public embed ──────────────────────────
  if (id === 'oc_manage_open') {
    await interaction.deferReply({ ephemeral: true })
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.editReply({ content: 'You do not have permission to manage OC stock.' })
      return
    }
    const items = await getAllStock()
    await interaction.editReply({ ...buildOCManageEmbed(items), content: null })
    return
  }

  // ── Back to management panel from the edit view ──────────────────────────
  if (id === 'oc_manage') {
    await interaction.deferUpdate()
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.editReply({ content: 'You do not have permission to manage OC stock.' })
      return
    }
    const items = await getAllStock()
    await interaction.editReply({ ...buildOCManageEmbed(items), content: null })
    return
  }

  // ── Update item status ───────────────────────────────────────────────────
  if (id.startsWith('oc_status:')) {
    await interaction.deferUpdate()
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.followUp({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
      return
    }
    const parts = id.split(':')
    const itemId = parts[1]
    const newStatus = parts[2] as OcStockStatus
    await updateStockStatus(itemId, newStatus, interaction.user.id)
    const item = await getStockById(itemId)
    if (!item) {
      const items = await getAllStock()
      await interaction.editReply({ ...buildOCManageEmbed(items), content: null })
      return
    }
    await interaction.editReply({ ...buildOCEditItemEmbed(item), content: null })
    return
  }

  // ── Remove item ──────────────────────────────────────────────────────────
  if (id.startsWith('oc_remove:')) {
    await interaction.deferUpdate()
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.followUp({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
      return
    }
    const itemId = id.split(':')[1]
    await removeStockItem(itemId)
    const items = await getAllStock()
    await interaction.editReply({ ...buildOCManageEmbed(items), content: null })
    return
  }

  // ── Show add-item modal ──────────────────────────────────────────────────
  if (id === 'oc_add_modal') {
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.reply({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
      return
    }
    await interaction.showModal(buildOCAddModal())
    return
  }

  // ── Show set-URL modal ───────────────────────────────────────────────────
  if (id.startsWith('oc_url:')) {
    const itemId = id.slice('oc_url:'.length)
    const oc = await requireOCManager(interaction)
    if (!oc) {
      await interaction.reply({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
      return
    }
    const item = await getStockById(itemId)
    if (!item) {
      await interaction.reply({ content: 'Item not found.', ephemeral: true })
      return
    }
    await interaction.showModal(buildOCUrlModal(item))
    return
  }
}
