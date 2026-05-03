import type { ButtonInteraction } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { registerSendable, withSendButton } from '../../utils/sendable'

const BRAND_COLOR = 0x588c7e

function businessCardsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🖼️ Business Cards')
    .setDescription(
      [
        'Business Cards must be designed to fit onto a **1920x1080** canvas while having the actual business card be about **1280x720** centered in the middle.',
        '||This allows the game to still be in the background as the image basically opens up fullscreen.||',
        '',
        'They can have transparency, holes, cuts, and rounded edges.',
        '',
        'GIFs are also accepted, however quality checked to ensure they are realistic in nature *(should only be used for holographic designs or metallic finishes)*.',
      ].join('\n')
    )
    .setImage('http://i.jasontucker.me/Print-Size-Guide.png')
}

function tradingCardsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🃏 Trading Cards')
    .setDescription(
      [
        'All Trading Cards are printed through McKenzie Enterprises. Prints are **$300 per**. No bulk printing offered.',
        'See [more information here](https://mke.euphoric.gg/info/trading-cards)!',
        '',
        '-# Designs must be approved by an MKE Manager to ensure utmost quality.',
      ].join('\n')
    )
}

function otherPrintablesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('📄 Other Printables')
    .setDescription(
      [
        'All other printables must fit on a `1920x1080` transparent canvas with the poster/flyer placed in the middle.',
        '',
        '### Books',
        'Books are **1285x904**.',
        'Please ask an **MKE Manager** for more info.',
        '',
        '1. All books/cards must be centered on a **1920x1080** canvas — without this the item takes up the entire screen.',
        '1. File format is `.png` uploaded to a hosting site such as [PostImages](https://postimages.org/) (we prefer PostImages, but gyazo is also acceptable).',
        '1. Books have a **maximum of 20 allotted pages**: __18 + 1 front cover__ and __1 back cover__. This can become __38 + front and back cover__ as each page can be double-sided.',
        '1. All print requests must be submitted via a ticket. The template will be in the pinned message.',
      ].join('\n')
    )
    .setImage('http://i.jasontucker.me/Print-Size-Guide.png')
}

// Map of section key → content builder
// Keys must match the customId suffix used in printInfo.ts buttons
const SECTIONS: Record<string, () => { embeds: EmbedBuilder[] }> = {
  business_cards: () => ({ embeds: [businessCardsEmbed()] }),
  trading_cards: () => ({ embeds: [tradingCardsEmbed()] }),
  other_printables: () => ({ embeds: [otherPrintablesEmbed()] }),
}

// Register each section so the global "Send to Channel" handler can re-build them
for (const [section, builder] of Object.entries(SECTIONS)) {
  registerSendable(`print_info:${section}`, builder)
}

export async function handlePrintInfoButton(interaction: ButtonInteraction): Promise<void> {
  // customId format: 'print_info:business_cards'
  const section = interaction.customId.split(':')[1]
  const builder = SECTIONS[section]
  if (!builder) return

  await interaction.reply(withSendButton(`print_info:${section}`, builder()))
}
