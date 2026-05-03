import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js'
import { registerSendable, withSendButtonV2 } from '../utils/sendable'

export const CAKED_COLOR = 0xf48fb1

export const data = new SlashCommandBuilder()
  .setName('caked')
  .setDescription('Caked Up order and event information')
  .setDMPermission(false)

export function cakedMainContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '# Please have the following information ready',
          '',
          '### Contact Information',
          '- Name',
          '- Phone Number',
          '- Bank Number for Order',
          '',
          '### Event Information',
          '- Event Date and Time',
          '- Total people',
          '- Dietary Restrictions',
          '- Items you would like',
          '',
          '> 💡 **TIP:** You can do </cakedpricing:1146684736417304666> to see pricing',
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
    )
}

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
