import type { ButtonInteraction } from 'discord.js'
import { EmbedBuilder } from 'discord.js'

const BRAND_COLOR = 0x588c7e

function businessCardsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🖼️ Business Cards')
    .setDescription(
      [
        'Business Cards must be designed to fit onto a **1920x1080** canvas while having the actual business card be about **1280x720** centered in the middle.',
        // ||spoiler|| text is hidden until the user clicks it — good for extra context
        '||This allows the game to still be in the background as the image basically opens up fullscreen.||',
        '',
        'They can have transparency, holes, cuts, and rounded edges.',
        '',
        // *italic* for a softer note
        'GIFs are also accepted, however quality checked to ensure they are realistic in nature *(should only be used for holographic designs or metallic finishes)*.',
      ].join('\n')
    )
    // setImage() places a large image at the very bottom of the embed
    .setImage('http://i.jasontucker.me/Print-Size-Guide.png')
}

function tradingCardsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🃏 Trading Cards')
    .setDescription(
      [
        'All Trading Cards are printed through McKenzie Enterprises. Prints are **$300 per**. No bulk printing offered.',
        // Hyperlinks in embed descriptions are always clickable
        'See [more information here](https://mke.euphoric.gg/info/trading-cards)!',
        '',
        // -# subtext for the fine-print approval note
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
        // `backticks` for inline code/monospace — good for exact dimensions
        'All other printables must fit on a `1920x1080` transparent canvas with the poster/flyer placed in the middle.',
        '',
        // ### H3 header — the smallest Discord header; works in embed descriptions
        '### Books',
        'Books are **1285x904**.',
        'Please ask an **MKE Manager** for more info.',
        '',
        // Numbered lists — Discord auto-increments so you can use 1. for every line
        '1. All books/cards must be centered on a **1920x1080** canvas — without this the item takes up the entire screen.',
        // `.png` inline code to highlight the file format
        '1. File format is `.png` uploaded to a hosting site such as [PostImages](https://postimages.org/) (we prefer PostImages, but gyazo is also acceptable).',
        // __underline__ for emphasis on the numbers
        '1. Books have a **maximum of 20 allotted pages**: __18 + 1 front cover__ and __1 back cover__. This can become __38 + front and back cover__ as each page can be double-sided.',
        '1. All print requests must be submitted using a ticket. The template will be in the pinned message.',
      ].join('\n')
    )
    .setImage('http://i.jasontucker.me/Print-Size-Guide.png')
}

const SECTION_EMBEDS: Record<string, () => EmbedBuilder> = {
  business_cards: businessCardsEmbed,
  trading_cards: tradingCardsEmbed,
  other_printables: otherPrintablesEmbed,
}

export async function handlePrintInfoButton(interaction: ButtonInteraction): Promise<void> {
  // customId format: 'print_info:business_cards'
  const section = interaction.customId.split(':')[1]
  const builder = SECTION_EMBEDS[section]
  if (!builder) return

  // ephemeral: true — only the person who clicked sees this reply
  // The original public message stays visible for others
  await interaction.reply({ embeds: [builder()], ephemeral: true })
}
