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

interface RegistryEntry {
  builder: () => SendablePayload
  expiresAt: number
}

const registry = new Map<string, RegistryEntry>()
/** Send-to-channel is hit immediately after the ephemeral arrives — 1 h is
 *  plenty. Without this the registry was monotonically growing for every
 *  /lookup, /business, /oc, /printinfo, /artsize, /tcsheet, /caked call,
 *  retaining each closure's captured payload for the bot's lifetime. */
const SENDABLE_TTL_MS = 60 * 60_000
const SENDABLE_MAX_ENTRIES = 200
const SENDABLE_SWEEP_INTERVAL_MS = 30 * 60_000

function sweepSendables(): void {
  const now = Date.now()
  for (const [k, e] of registry) if (e.expiresAt < now) registry.delete(k)
}

export function registerSendable(key: string, builder: () => SendablePayload): void {
  // Sweep expired entries first — cheap and frees space before the hard-cap kicks in.
  if (registry.size > SENDABLE_MAX_ENTRIES) sweepSendables()
  registry.set(key, { builder, expiresAt: Date.now() + SENDABLE_TTL_MS })
  // Hard-cap regardless of TTL: drop oldest entries (Map iteration is
  // insertion-ordered) until we're back under the limit. Belt-and-braces
  // against a flood of new registrations within a single sweep window.
  while (registry.size > SENDABLE_MAX_ENTRIES) {
    const oldest = registry.keys().next().value
    if (oldest === undefined) break
    registry.delete(oldest)
  }
}

// Periodic sweep so a quiet bot still trims expired entries even when no new
// `registerSendable` calls come in to trigger the on-insert sweep. `.unref()`
// keeps the timer from holding the event loop open at shutdown.
const sendableSweepTimer = setInterval(sweepSendables, SENDABLE_SWEEP_INTERVAL_MS)
sendableSweepTimer.unref()

export function stopSendableSweep(): void {
  clearInterval(sendableSweepTimer)
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
  const entry = registry.get(key)

  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) registry.delete(key)  // expired — clean up while we're here
    await interaction.reply({ content: 'This section is no longer available — re-run the command and try again.', ephemeral: true })
    return
  }

  const payload = entry.builder()
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
