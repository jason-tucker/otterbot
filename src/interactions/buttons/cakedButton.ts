import {
  type ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js'
import { cakedPricingContainer } from '../../services/cakedRenderers'
import { registerSendable, withSendButtonV2 } from '../../utils/sendable'

// Pricing container lives in `services/cakedRenderers.ts` so the panel-side
// `caked.message_post` verb can post the exact same card. Register the
// sendable here at module load so Send-to-Channel still works for the
// slash-command flow.
registerSendable('caked:pricing', () => ({
  components: [cakedPricingContainer()],
  flags: MessageFlags.IsComponentsV2,
}))

// ── Button handler ─────────────────────────────────────────────────────────

export async function handleCakedButton(interaction: ButtonInteraction): Promise<void> {
  const action = interaction.customId.split(':')[1]

  if (action === 'contact') {
    const modal = new ModalBuilder()
      .setCustomId('caked_contact_submit')
      .setTitle('Caked Up — Contact Information')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Your Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('phone')
            .setLabel('Phone Number')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('bank')
            .setLabel('Bank Number')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      )

    await interaction.showModal(modal)
    return
  }

  if (action === 'event') {
    const modal = new ModalBuilder()
      .setCustomId('caked_event_submit')
      .setTitle('Caked Up — Event Information')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('items')
            .setLabel('What Items would you like')
            .setPlaceholder('Cake')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(2)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('people')
            .setLabel('People Attending')
            .setPlaceholder('Total People Attending the Event')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('restrictions')
            .setLabel('Any Dietary Restrictions')
            .setPlaceholder('No Wheat')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('taste')
            .setLabel('Would you like a taste test')
            .setPlaceholder('Yes/No')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(3)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('dateandtime')
            .setLabel('Event Date and Time')
            .setPlaceholder('6/9/1969 4:20AM')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      )

    await interaction.showModal(modal)
    return
  }

  if (action === 'pricing') {
    await interaction.reply(withSendButtonV2('caked:pricing', cakedPricingContainer()))
  }
}
