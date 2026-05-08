import {
  type ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'
import { sepBlank } from '../../utils/cv2'
import {
  ContainerBuilder,
  TextDisplayBuilder,

  MediaGalleryBuilder,

  MessageFlags,
} from 'discord.js'
import { CAKED_COLOR } from '../../commands/caked'
import { registerSendable, withSendButtonV2 } from '../../utils/sendable'

// ── Pricing ────────────────────────────────────────────────────────────────

function pricingContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          'Below is our base pricing for Custom Cakes! If you have any questions, or you\'d like something not listed, please let us know! You don\'t have to pay extra to have your cake picked up or delivered, but you will need to pay extra to have your event catered by us!',
          '',
          '# Custom Cake Prices',
          '• **$3,500** — Custom Cake Design *(30 Slices/Cupcakes included)*',
          '• **$2,000** — Rush Order Fee *(Less than 72 hours notice)*',
          '',
          '# Catering Pricing and Fees',
          '• **$500** — 1 Employee for the __First Hour__',
          '• **$1,000** — 1 Employee per additional hour',
          '• **$1,000** — Per Additional Employee',
          '',
          '## Add Ons',
          '• **$300** — Per 20 Slices/Cupcakes',
          '• **$600** — Per 30 Drinks',
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      sepBlank()
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems([
        { media: { url: 'http://i.jasontucker.me/1685847590-Illustrator_TUCKERPC_10_.png' } },
      ])
    )
}

registerSendable('caked:pricing', () => ({
  components: [pricingContainer()],
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
    await interaction.reply(withSendButtonV2('caked:pricing', pricingContainer()))
  }
}
