import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from 'discord.js'

export const CAKED_COLOR = 0xf48fb1

export const data = new SlashCommandBuilder()
  .setName('caked')
  .setDescription('Caked Up order and event information')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const container = new ContainerBuilder()
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
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
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
          .setStyle(ButtonStyle.Secondary)
      )
    )

  await interaction.reply({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: [container] as any,
    flags: MessageFlags.IsComponentsV2,
  })
}
