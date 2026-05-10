import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'

export const data = new SlashCommandBuilder()
  .setName('report')
  .setDescription('Report a bug or request a feature — files a GitHub issue')

/**
 * Per-user rate limit for `/report`. Without this, anyone can spam the
 * owner's DMs (every submission is DM'd for review). 5-minute cooldown
 * matches the modal-fill effort and gives the owner room to react.
 */
const REPORT_COOLDOWN_MS = 5 * 60_000
const lastReportAt = new Map<string, number>()

function sweepReportCooldowns(): void {
  const cutoff = Date.now() - REPORT_COOLDOWN_MS
  for (const [k, t] of lastReportAt) if (t < cutoff) lastReportAt.delete(k)
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const last = lastReportAt.get(interaction.user.id) ?? 0
  const remaining = REPORT_COOLDOWN_MS - (Date.now() - last)
  if (remaining > 0) {
    const sec = Math.ceil(remaining / 1000)
    const label = sec >= 60 ? `${Math.ceil(sec / 60)} minute(s)` : `${sec} seconds`
    await interaction.reply({
      content: `⏳ You filed a report recently. Try again in ~${label}.`,
      ephemeral: true,
    })
    return
  }
  if (lastReportAt.size > 200) sweepReportCooldowns()
  // Stamp the cooldown when the modal opens — closing without submitting
  // is fine, the next attempt won't be blocked beyond the 5-min window.
  lastReportAt.set(interaction.user.id, Date.now())

  const modal = new ModalBuilder()
    .setCustomId('report:submit')
    .setTitle('Report Bug / Feature Request')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(200)
          .setRequired(true)
          .setPlaceholder('Short summary of the issue or request')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel('Type')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setRequired(true)
          .setPlaceholder('bug, feature, or question')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(2000)
          .setRequired(true)
          .setPlaceholder('What happened? What did you expect?')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('steps')
          .setLabel('Steps to reproduce (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
      ),
    )

  await interaction.showModal(modal)
}
