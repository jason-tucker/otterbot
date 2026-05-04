import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { getAllStock } from '../services/ocStockService'
import { buildOCPublicContainer } from '../embeds/ocEmbed'
import { registerSendable, withSendButtonV2 } from '../utils/sendable'

export const data = new SlashCommandBuilder()
  .setName('oc')
  .setDescription('View Original Clothing current stock and availability')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const resolved = await resolveBusinesses(member)
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')
  const isManager = oc ? hasMinRank(oc.rank, 'manager') : false

  const items = await getAllStock()
  const container = buildOCPublicContainer(items)

  const sendKey = `oc_stock:${interaction.id}`
  registerSendable(sendKey, () => ({ components: [container], flags: 32768 }))

  const extraButtons: ButtonBuilder[] = []
  if (isManager) {
    extraButtons.push(
      new ButtonBuilder()
        .setCustomId('oc_manage_open')
        .setLabel('Manage Stock')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  await interaction.editReply({ ...withSendButtonV2(sendKey, container, extraButtons), content: null })
}
