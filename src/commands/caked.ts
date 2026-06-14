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

// `execute()` registers a per-interaction send key (`caked:main:{id}`) so the
// Send-to-Channel button posts exactly what the user is currently looking
// at — overrides included. (The /oc command uses the same pattern.) We
// keep this static registration as a safety net for older ephemeral
// embeds whose button still points at the bare "caked:main" key.
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
  // Ack first — everything below is DB work (override + button reads, the
  // manager check) that previously all ran before `interaction.reply`,
  // risking the 3-second ack window on a cold cache or a slow pool.
  await interaction.deferReply({ ephemeral: true })

  const businessId = await resolveBusinessIdBySlug('caked-up')

  // Manager-or-sudo gets the Manage Buttons affordance. Best-effort — a failed
  // member fetch shouldn't break the public command, just hide the button.
  async function checkManager(): Promise<boolean> {
    if (!businessId || !interaction.inGuild() || !interaction.guild) return false
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id)
      if (isSudoUser(member)) return true
      const resolved = await resolveBusinesses(member)
      const r = resolved.find((rb) => rb.business.id === businessId)
      return !!(r && hasMinRank(r.rank, 'manager'))
    } catch {
      return false
    }
  }

  // The three reads are independent — run them concurrently.
  const [overrides, customButtons, isManager] = await Promise.all([
    businessId
      ? getBusinessMessageOverrides(businessId, CAKED_EDITABLE_KEYS)
      : Promise.resolve({} as Record<string, string>),
    businessId ? listEnabledButtons(businessId) : Promise.resolve([]),
    checkManager(),
  ])

  const container = cakedMainContainer(overrides)
  appendPanelLink(container, '/otter/caked', 'Manage Caked Up on the website')

  // Manager-configured custom buttons (link / info), shown to everyone and
  // included in the Send-to-Channel post so customers can use them publicly.
  const customRows = buildCustomButtonRows(customButtons)

  // Per-interaction send key so Send-to-Channel posts exactly the snapshot
  // this user is reading. The previous shared 'caked:main' key meant two
  // people running /caked concurrently clobbered each other's snapshot —
  // user A's Send could post user B's view. The static 'caked:main'
  // registration above stays as a fallback for old ephemerals.
  const sendKey = `caked:main:${interaction.id}`
  registerSendable(sendKey, () => ({
    components: [cakedMainContainer(overrides), ...buildCustomButtonRows(customButtons)],
    flags: MessageFlags.IsComponentsV2,
  }))

  const extraRows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...cakedNavButtons),
    ...customRows,
  ]
  const trailing: ButtonBuilder[] =
    isManager && businessId ? [manageButtonsButton(businessId)] : []

  await interaction.editReply({
    ...withSendButtonV2Rows(sendKey, container, extraRows, trailing),
    content: null,
  })
}
