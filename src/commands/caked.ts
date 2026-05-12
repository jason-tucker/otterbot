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

// Re-exported so existing button / modal handlers that import
// `CAKED_COLOR` / `cakedMainContainer` from this module keep working.
export { CAKED_COLOR, cakedMainContainer }

export const data = new SlashCommandBuilder()
  .setName('caked')
  .setDescription('Caked Up order and event information')
  .setDMPermission(false)

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
  await interaction.reply(withSendButtonV2('caked:main', cakedMainContainer(), cakedNavButtons))
}
