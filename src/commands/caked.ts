import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { registerSendable, withSendButtonV2Rows } from '../utils/sendable'
import {
  CAKED_COLOR,
  cakedMainContainer,
} from '../services/cakedRenderers'
import {
  CAKED_EDITABLE_KEYS,
  getBusinessMessageOverrides,
  resolveBusinessIdBySlug,
} from '../services/businessMessagesService'
import { resolveBusinesses, hasMinRank } from '../services/permissionService'
import { isSudoUser } from '../services/sudoService'
import { listEnabledButtons } from '../services/businessButtonsService'
import { buildCustomButtonRows, manageButtonsButton } from '../embeds/businessButtons'
import { appendPanelLink } from '../utils/panelLink'

// Re-exported so existing button / modal handlers that import
// `CAKED_COLOR` / `cakedMainContainer` from this module keep working.
export { CAKED_COLOR, cakedMainContainer }

export const data = new SlashCommandBuilder()
  .setName('caked')
  .setDescription('Caked Up order and event information')
  .setDMPermission(false)

// The "caked:main" send key is re-registered inside `execute()` so the
// Send-to-Channel button posts exactly what the user is currently looking
// at — overrides included. (The /oc command uses the same pattern.) We
// keep the static registration here as a safety net for older ephemeral
// embeds that might still have the button pointing at this key.
registerSendable('caked:main', () => ({
  components: [cakedMainContainer()],
  flags: MessageFlags.IsComponentsV2,
}))

const cakedNavButtons = [
  new ButtonBuilder()
    .setCustomId('caked:contact')
    .setLabel('Contact Info')
    .setEmoji('📋')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('caked:event')
    .setLabel('Event Info')
    .setEmoji('🎉')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('caked:pricing')
    .setLabel('Pricing')
    .setEmoji('💰')
    .setStyle(ButtonStyle.Secondary),
]

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const businessId = await resolveBusinessIdBySlug('caked-up')
  const overrides = businessId
    ? await getBusinessMessageOverrides(businessId, CAKED_EDITABLE_KEYS)
    : {}
  const container = cakedMainContainer(overrides)
  appendPanelLink(container, '/otter/caked', 'Manage Caked Up on the website')

  // Manager-configured custom buttons (link / info), shown to everyone and
  // included in the Send-to-Channel post so customers can use them publicly.
  const customButtons = businessId ? await listEnabledButtons(businessId) : []
  const customRows = buildCustomButtonRows(customButtons)

  // Re-register the send key against this exact override snapshot so
  // Send-to-Channel posts what the user is reading right now, not the
  // static default. Same trick `/oc` uses with a per-interaction key.
  registerSendable('caked:main', () => ({
    components: [cakedMainContainer(overrides), ...buildCustomButtonRows(customButtons)],
    flags: MessageFlags.IsComponentsV2,
  }))

  // Manager-or-sudo gets the Manage Buttons affordance. Best-effort — a failed
  // member fetch shouldn't break the public command, just hide the button.
  let isManager = false
  if (businessId && interaction.inGuild() && interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id)
      isManager = isSudoUser(member)
      if (!isManager) {
        const resolved = await resolveBusinesses(member)
        const r = resolved.find((rb) => rb.business.id === businessId)
        isManager = !!(r && hasMinRank(r.rank, 'manager'))
      }
    } catch {
      isManager = false
    }
  }

  const extraRows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...cakedNavButtons),
    ...customRows,
  ]
  const trailing: ButtonBuilder[] =
    isManager && businessId ? [manageButtonsButton(businessId)] : []

  await interaction.reply(withSendButtonV2Rows('caked:main', container, extraRows, trailing))
}
