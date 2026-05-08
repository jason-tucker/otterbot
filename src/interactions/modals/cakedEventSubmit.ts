import { type ModalSubmitInteraction, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js'
import { CAKED_COLOR } from '../../commands/caked'
import { sep } from '../../utils/cv2'

export async function handleCakedEventSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const items = interaction.fields.getTextInputValue('items')
  const people = interaction.fields.getTextInputValue('people')
  const restrictions = interaction.fields.getTextInputValue('restrictions')
  const taste = interaction.fields.getTextInputValue('taste')
  const dateandtime = interaction.fields.getTextInputValue('dateandtime')

  const container = new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('🎉 **Caked Up — Event Submission**')
    )
    .addSeparatorComponents(
      sep()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Items:** ${items}`,
          `**People Attending:** \`${people}\``,
          `**Dietary Restrictions:** ${restrictions}`,
          `**Taste Test:** \`${taste}\``,
          `**Event Date & Time:** \`${dateandtime}\``,
          '',
          `-# Submitted by ${interaction.user.toString()}`,
        ].join('\n')
      )
    )

  await interaction.reply({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: [container] as any,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}
