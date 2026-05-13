import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { registerSendable, withSendButtonV2 } from '../utils/sendable'
import {
  CAKED_COLOR,
  cakedMainContainer,
} from '../services/cakedRenderers'
import {
  CAKED_EDITABLE_KEYS,
  getBusinessMessageOverrides,
  resolveBusinessIdBySlug,
} from '../services/businessMessagesService'

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
  // Re-register the send key against this exact override snapshot so
  // Send-to-Channel posts what the user is reading right now, not the
  // static default. Same trick `/oc` uses with a per-interaction key.
  registerSendable('caked:main', () => ({
    components: [cakedMainContainer(overrides)],
    flags: MessageFlags.IsComponentsV2,
  }))
  await interaction.reply(withSendButtonV2('caked:main', container, cakedNavButtons))
}
