import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  type ChatInputCommandInteraction,
} from 'discord.js'
import type { ResolvedBusiness } from '../types/domain'
import type { BusinessButton } from '../services/businessButtonsService'
import { errorReport } from '../utils/errorReport'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { getAllStock } from '../services/ocStockService'
import { buildOCPublicContainer } from '../embeds/ocEmbed'
import { registerSendable, withSendButtonV2Rows } from '../utils/sendable'
import { resolveBusinessIdBySlug } from '../services/businessMessagesService'
import { listEnabledButtons } from '../services/businessButtonsService'
import { buildCustomButtonRows, manageButtonsButton } from '../embeds/businessButtons'
import { appendPanelLink } from '../utils/panelLink'

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
  // The permission lookup only decides whether the manager buttons show, so a
  // failure there must not kill the stock view for everyone else: fall back
  // to the plain (non-manager) card and log the real cause.
  const [resolved, items] = await Promise.all([
    resolveCallerBusinesses(interaction),
    getAllStock(),
  ])
  const oc = resolved.find((r) => r.business.slug === 'original-clothing')
  const isManager = oc ? hasMinRank(oc.rank, 'manager') : false

  const container = buildOCPublicContainer(items)
  appendPanelLink(container, '/otter/oc-stock', 'View & manage OC stock on the website')

  const ocBusinessId = oc?.business.id ?? (await resolveBusinessIdBySlug('original-clothing'))
  const customButtons = ocBusinessId ? await loadCustomButtons(interaction, ocBusinessId) : []
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

  try {
    await interaction.editReply({
      ...withSendButtonV2Rows(sendKey, container, extraRows, trailing),
      content: null,
    })
  } catch (err) {
    // Discord rejected the full card (e.g. 50035 from one bad custom button).
    // Log the real cause, then retry with only the stock card and the
    // built-in buttons so the user still gets the stock view.
    reportOcFailure(interaction, 'editReply (full card)', err)
    const fallbackRows = [new ActionRowBuilder<ButtonBuilder>().addComponents(...builtinButtons)]
    await interaction.editReply({
      ...withSendButtonV2Rows(sendKey, container, fallbackRows, []),
      content: null,
    })
  }
}

/** Resolve the caller's businesses. Never throws — returns [] on failure. */
async function resolveCallerBusinesses(
  interaction: ChatInputCommandInteraction,
): Promise<ResolvedBusiness[]> {
  try {
    // Use the member that came with the interaction when it is a full
    // GuildMember; only fetch over REST when it is not.
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild!.members.fetch(interaction.user.id)
    return await resolveBusinesses(member)
  } catch (err) {
    reportOcFailure(interaction, 'resolveBusinesses', err)
    return []
  }
}

/** Load enabled custom buttons. Never throws — returns [] on failure. */
async function loadCustomButtons(
  interaction: ChatInputCommandInteraction,
  businessId: string,
): Promise<BusinessButton[]> {
  try {
    return await listEnabledButtons(businessId)
  } catch (err) {
    reportOcFailure(interaction, 'listEnabledButtons', err)
    return []
  }
}

function reportOcFailure(interaction: ChatInputCommandInteraction, step: string, err: unknown): void {
  const tag = `cmd=oc step=${step} user=${interaction.user.id} guild=${interaction.guildId ?? 'dm'}`
  console.error(`[oc] ${tag}`, err)
  errorReport(tag, err)
}
