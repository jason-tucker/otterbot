import { type ModalSubmitInteraction, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js'
import { CAKED_COLOR } from '../../commands/caked'
import { sep } from '../../utils/cv2'
import { safeInlineCode, safeMarkdown } from '../../utils/escape'

// Same caps as the modal inputs. Modals already open when the caps shipped can
// still submit up to 4000 chars per field, which would push the card past the
// 4000-char TextDisplay limit — clamp the raw value before escaping.
const clamp = (v: string, max: number): string => v.slice(0, max)

export async function handleCakedEventSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const items = safeMarkdown(clamp(interaction.fields.getTextInputValue('items'), 1000))
  const people = safeInlineCode(clamp(interaction.fields.getTextInputValue('people'), 3))
  const restrictions = safeMarkdown(clamp(interaction.fields.getTextInputValue('restrictions'), 500))
  const taste = safeInlineCode(clamp(interaction.fields.getTextInputValue('taste'), 3))
  const dateandtime = safeInlineCode(clamp(interaction.fields.getTextInputValue('dateandtime'), 100))

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
