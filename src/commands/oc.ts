import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { getAllStock } from '../services/ocStockService'
import { buildOCPublicContainer } from '../embeds/ocEmbed'
import { registerSendable, withSendButtonV2Rows } from '../utils/sendable'
import { resolveBusinessIdBySlug } from '../services/businessMessagesService'
import { listEnabledButtons } from '../services/businessButtonsService'
import { buildCustomButtonRows, manageButtonsButton } from '../embeds/businessButtons'

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

  // Permission resolution and the stock read are independent — overlap them.
  const [resolved, items] = await Promise.all([
    interaction.guild.members.fetch(interaction.user.id).then((m) => resolveBusinesses(m)),
    getAllStock(),
  ])
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')
  const isManager = oc ? hasMinRank(oc.rank, 'manager') : false

  const container = buildOCPublicContainer(items)

  const ocBusinessId = oc?.business.id ?? (await resolveBusinessIdBySlug('original-clothing'))
  const customButtons = ocBusinessId ? await listEnabledButtons(ocBusinessId) : []
  const customRows = buildCustomButtonRows(customButtons)

  const sendKey = `oc_stock:${interaction.id}`
  registerSendable(sendKey, () => ({
    components: [container, ...buildCustomButtonRows(customButtons)],
    flags: 32768,
  }))

  // Built-in OC controls live in their own row; custom manager buttons follow.
  const builtinButtons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId('oc_requirements')
      .setLabel('Requirements')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
  ]
  if (isManager) {
    builtinButtons.push(
      new ButtonBuilder()
        .setCustomId('oc_manage_open')
        .setLabel('Manage Stock')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
    )
  }

  const extraRows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...builtinButtons),
    ...customRows,
  ]
  const trailing: ButtonBuilder[] =
    isManager && ocBusinessId ? [manageButtonsButton(ocBusinessId)] : []

  await interaction.editReply({
    ...withSendButtonV2Rows(sendKey, container, extraRows, trailing),
    content: null,
  })
}
