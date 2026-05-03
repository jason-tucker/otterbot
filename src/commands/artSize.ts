import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js'
import { registerSendable, withSendButtonV2 } from '../utils/sendable'

const BRAND_COLOR = 0x588c7e

function artSizeContainer(): ContainerBuilder {
  return (
    new ContainerBuilder()
      .setAccentColor(BRAND_COLOR)

      // ── Header ────────────────────────────────────────────────────────────
      // TextDisplayBuilder renders markdown the same as embed descriptions.
      // -# subtext is perfect for small footnote-style info on a header.
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('🎨 **Art Size Guide**\n-# All dimensions in pixels')
      )

      // SeparatorBuilder with setDivider(true) draws a visible horizontal line.
      // SeparatorSpacingSize.Large adds extra vertical padding on both sides.
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      )

      // ── Size list ─────────────────────────────────────────────────────────
      // One TextDisplay covers the full list. Blockquotes (>) are supported
      // inside TextDisplay just like in embed descriptions.
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            '📸 **Badge Photos** — `186x230`',
            '-# Can be multiplied by 4',
            '',
            '🪧 **Billboard** — `1500x600` horizontal  ·  `600x1000` vertical',
            '',
            '🖼️ **Business Cards** — `1280x720` inside a `1920x1080` canvas',
            '',
            '🏷️ **Item** — `300x300`',
            '> `50px` padding all around',
            '> Drop Shadow: Multiply · Opac `100%` · Angle `125°` · Distance `8` · Spread `10` · Size `21`',
            '> *PSD available on request — <@263791442781011968> or <@99313186888511488>*',
            '',
            '🔵 **Logos** — `4000x4000`',
            '',
            '📱 **Phone Backgrounds** — `1242x2688`',
            '',
            '🆔 **Press Pass** — `600x900`',
            '',
            '📋 **Office Banner** — `3600x1000`',
            '',
            '🏖️ **Beach Stall Banner** — `511x114`',
            '',
            '🎯 **Yeeter Size** — `1120x948`',
            '',
            '🃏 **Trading Cards** — `750x1050`',
          ].join('\n')
        )
      )

      // ── Printable frame note ──────────────────────────────────────────────
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '📠 All printable items use a `1920x1080` frame — transparent background required so the game shows through.\n__All printable items (including Business Cards) now support transparency.__'
        )
      )

      // ── Reference image ───────────────────────────────────────────────────
      // MediaGalleryBuilder displays 1–10 images in a gallery below the text.
      // Replace the URL with your own art size reference image if you have one.
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems([
          { media: { url: 'http://i.jasontucker.me/Print-Size-Guide.png' } },
        ])
      )
  )
}

// Register the public (non-ephemeral) version for the Send to Channel handler
registerSendable('art_size', () => ({
  components: [artSizeContainer()],
  flags: MessageFlags.IsComponentsV2,
}))

export const data = new SlashCommandBuilder()
  .setName('artsize')
  .setDescription('Art and print size reference guide')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(withSendButtonV2('art_size', artSizeContainer()))
}
