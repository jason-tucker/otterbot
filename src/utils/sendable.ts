/**
 * Reusable "Send to Channel" utility.
 *
 * USAGE — two steps for any command that wants a send button:
 *
 *   1. Register the content builder with a unique key (do this at module load time):
 *        registerSendable('my_feature:section_name', () => ({ embeds: [myEmbed()] }))
 *
 *   2. Reply with the content + the send button attached:
 *        await interaction.reply(withSendButton('my_feature:section_name', { embeds: [myEmbed()] }))
 *
 *   3. Route 'send_to_channel:' buttons to handleSendToChannel in interactionCreate.ts.
 *      (Already done — no extra wiring needed for new features, just steps 1 & 2.)
 *
 * HOW IT WORKS:
 *   withSendButton wraps any message payload as ephemeral and appends a "📢 Send to Channel" button.
 *   When clicked, handleSendToChannel re-builds the content from the registry and posts it publicly,
 *   then strips the button from the ephemeral reply so the user can't re-post it.
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type ButtonInteraction,
} from 'discord.js'

// Anything a builder can produce — embeds and/or a text string
export interface SendablePayload {
  embeds?: EmbedBuilder[]
  content?: string
}

// Registry: key → function that builds the public message content
const registry = new Map<string, () => SendablePayload>()

/** Register a key → content builder. Call at module load time (top-level). */
export function registerSendable(key: string, builder: () => SendablePayload): void {
  registry.set(key, builder)
}

/**
 * Wrap a payload as ephemeral and attach a "📢 Send to Channel" button.
 * Pass the result directly to interaction.reply() or interaction.editReply().
 */
export function withSendButton(key: string, payload: SendablePayload) {
  return {
    ...payload,
    ephemeral: true,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`send_to_channel:${key}`)
          .setLabel('Send to Channel')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  } as const
}

/**
 * Button handler for all 'send_to_channel:<key>' interactions.
 * Strips the button from the ephemeral reply, then posts the content publicly.
 */
export async function handleSendToChannel(interaction: ButtonInteraction): Promise<void> {
  const key = interaction.customId.slice('send_to_channel:'.length)
  const builder = registry.get(key)

  if (!builder) {
    await interaction.reply({ content: 'This section is no longer available.', ephemeral: true })
    return
  }

  // Remove the button so the user can't post the same thing twice
  await interaction.update({ components: [] })

  // Build fresh content and post publicly in the channel
  const { embeds, content } = builder()
  await interaction.followUp({ embeds, content, ephemeral: false })
}
