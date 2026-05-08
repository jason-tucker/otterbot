import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js'
import { registerSendable, withSendButtonV2 } from '../utils/sendable'
import { sepLarge } from '../utils/cv2'

const BRAND_COLOR = 0x588c7e
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1JBT6-cuMNv9LP7YXvSboU56ry2-Jg7CCMVV-L2ShBPw/copy'

function tcSheetContainer(): ContainerBuilder {
  return (
    new ContainerBuilder()
      .setAccentColor(BRAND_COLOR)

      // ── Section ───────────────────────────────────────────────────────────
      // SectionBuilder pairs text on the left with an accessory on the right.
      // The accessory can be a Button (any style, including Link) or Thumbnail.
      // Link buttons in a Section open the URL without triggering an interaction handler.
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '📊 **Trading Card Sheet**\n\nClick the button to copy the sheet.\nBe sure to set sharing to **Anyone can edit**.'
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel('Open Sheet')
              .setURL(SHEET_URL)
              .setStyle(ButtonStyle.Link)
              .setEmoji('📊')
          )
      )

      // ── Rename instructions ───────────────────────────────────────────────
      // SeparatorSpacingSize.Large gives breathing room between sections.
      .addSeparatorComponents(
        sepLarge()
      )
      // ### H3 header works inside TextDisplay components
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '### Rename your copy to:\n**Ticket Number _ Pack Title**\n`101_McKenzieFamilyTCs`'
        )
      )
  )
}

registerSendable('tc_sheet', () => ({
  components: [tcSheetContainer()],
  flags: MessageFlags.IsComponentsV2,
}))

export const data = new SlashCommandBuilder()
  .setName('tcsheet')
  .setDescription('Get the Trading Card order sheet')
  .setDMPermission(false)

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(withSendButtonV2('tc_sheet', tcSheetContainer()))
}
