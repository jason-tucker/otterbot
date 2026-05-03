import { type ModalSubmitInteraction, MessageFlags } from 'discord.js'
import { ContainerBuilder, TextDisplayBuilder } from 'discord.js'
import { CAKED_COLOR } from '../../commands/caked'

export async function handleCakedContactSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const name = interaction.fields.getTextInputValue('name')
  const phone = interaction.fields.getTextInputValue('phone') || '*Not provided*'
  const bank = interaction.fields.getTextInputValue('bank')

  const container = new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '🎂 **Caked Up — New Client**',
          '',
          `**Name:** \`${name}\``,
          `**Bank:** \`${bank}\``,
          `**Phone Number:** \`${phone}\``,
          '',
          `-# Submitted by ${interaction.user.toString()}`,
        ].join('\n')
      )
    )

  await interaction.reply({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: [container] as any,
    flags: MessageFlags.IsComponentsV2,
  })
}
