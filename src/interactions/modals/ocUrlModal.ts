import { type ModalSubmitInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../../services/permissionService'
import { getStockById, updateStockUrl } from '../../services/ocStockService'
import { buildOCEditItemEmbed } from '../../embeds/ocEmbed'
import { parseHttpUrlDetailed } from '../../utils/url'

export async function handleOCUrlSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) return

  const itemId = interaction.customId.slice('oc_url_submit:'.length)

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')

  if (!oc || !hasMinRank(oc.rank, 'manager')) {
    await interaction.reply({ content: 'You do not have permission to manage OC stock.', ephemeral: true })
    return
  }

  const rawUrl = interaction.fields.getTextInputValue('item_url').trim()
  // Reject anything that isn't an http(s) URL — the value gets rendered as a
  // markdown link `[name](url)` in the public OC stock embed, so accepting
  // arbitrary text would let a manager slip a `javascript:` / `data:` URL
  // into the channel for everyone to click.
  let url: string | null = null
  if (rawUrl.length > 0) {
    const result = parseHttpUrlDetailed(rawUrl)
    if (!result.ok) {
      const content = result.reason === 'wrong-protocol'
        ? `❌ URL must use http:// or https://. Got: \`${result.protocol}\``
        : `❌ Not a valid URL: \`${rawUrl.slice(0, 80)}\``
      await interaction.reply({ content, ephemeral: true })
      return
    }
    url = result.url.toString()
  }

  await updateStockUrl(itemId, url, interaction.user.id)

  const item = await getStockById(itemId)
  if (!item) {
    await interaction.reply({ content: 'Item no longer exists.', ephemeral: true })
    return
  }

  if (interaction.isFromMessage()) {
    await interaction.update({ ...buildOCEditItemEmbed(item), content: null } as any)
  } else {
    await interaction.reply({ ...buildOCEditItemEmbed(item), ephemeral: true } as any)
  }
}
