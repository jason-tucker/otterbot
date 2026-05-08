/**
 * Reusable "Send to Channel" utility — supports both v1 (embeds) and v2 (components) messages.
 *
 * USAGE:
 *
 *   V1 (embeds):
 *     registerSendable('my_feature:key', () => ({ embeds: [myEmbed()] }))
 *     await interaction.reply(withSendButton('my_feature:key', { embeds: [myEmbed()] }))
 *
 *   V2 (components — Container, Section, Separator, etc.):
 *     registerSendable('my_feature:key', () => ({ components: [myContainer()], flags: MessageFlags.IsComponentsV2 }))
 *     await interaction.reply(withSendButtonV2('my_feature:key', myContainer()))
 *
 *   No extra wiring needed in interactionCreate.ts for new features — send_to_channel: is already routed.
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  type ButtonInteraction,
} from 'discord.js'

export interface SendablePayload {
  embeds?: EmbedBuilder[]
  content?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: any[]
  flags?: number
}

/**
 * Default for every sendable: render `<@id>` / `<@&id>` as clickable links but
 * suppress the actual notification ping. Reference commands like /artsize and
 * /printinfo embed user/role mentions in their body text purely as references
 * — pinging the named users every time someone runs the command is the bug we
 * keep tripping over. Pass `allowedMentions` explicitly on the `interaction.reply`
 * / `interaction.followUp` call to override.
 */
const NO_PING_ALLOWED_MENTIONS = { parse: [] as const }

const registry = new Map<string, () => SendablePayload>()

export function registerSendable(key: string, builder: () => SendablePayload): void {
  registry.set(key, builder)
}

// ── V1: embed-based messages ───────────────────────────────────────────────
export function withSendButton(
  key: string,
  payload: Pick<SendablePayload, 'embeds' | 'content'>,
  extraButtons: ButtonBuilder[] = []
) {
  return {
    ...payload,
    ephemeral: true,
    allowedMentions: NO_PING_ALLOWED_MENTIONS,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...extraButtons,
        new ButtonBuilder()
          .setCustomId(`send_to_channel:${key}`)
          .setLabel('Send to Channel')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  } as const
}

// ── V2: component-based messages (Container, Section, Separator, etc.) ─────
export function withSendButtonV2(
  key: string,
  container: ContainerBuilder,
  extraButtons: ButtonBuilder[] = []
) {
  return {
    // ContainerBuilder needs to go through toJSON — cast so discord.js serialises it
    components: [
      container,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...extraButtons,
        new ButtonBuilder()
          .setCustomId(`send_to_channel:${key}`)
          .setLabel('Send to Channel')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Secondary)
      ),
    ] as unknown as ActionRowBuilder<ButtonBuilder>[],
    allowedMentions: NO_PING_ALLOWED_MENTIONS,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function handleSendToChannel(interaction: ButtonInteraction): Promise<void> {
  const key = interaction.customId.slice('send_to_channel:'.length)
  const builder = registry.get(key)

  if (!builder) {
    await interaction.reply({ content: 'This section is no longer available.', ephemeral: true })
    return
  }

  const payload = builder()
  const isV2 = !!(payload.flags && payload.flags & MessageFlags.IsComponentsV2)

  if (isV2) {
    // Can't easily strip the ActionRow from a v2 ephemeral without re-sending the full container;
    // just acknowledge silently so the public post goes through cleanly.
    await interaction.deferUpdate()
  } else {
    // Remove the Send button from the ephemeral reply
    await interaction.update({ components: [] })
  }

  // Strip the Ephemeral flag so the follow-up posts publicly
  const publicFlags =
    payload.flags !== undefined ? payload.flags & ~MessageFlags.Ephemeral : undefined

  await interaction.followUp({
    embeds: payload.embeds,
    content: payload.content,
    components: payload.components,
    flags: publicFlags,
    ephemeral: false,
    allowedMentions: NO_PING_ALLOWED_MENTIONS,
  })
}
