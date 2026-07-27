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
 *
 *   PERSISTENT (static, module-load) payloads:
 *     Pass `{ persistent: true }` for entries registered once at module load whose
 *     builder captures no per-interaction state (e.g. /artsize, /tcsheet, /printinfo's
 *     nav sections, /caked's static fallback keys). Persistent entries never expire
 *     and are never evicted by the hard-cap — otherwise, being the oldest entries in
 *     the registry, they'd be the first things dropped, and once the 1 h TTL passed
 *     the Send to Channel button would be permanently broken until the process
 *     restarted. Per-interaction entries (keyed by interaction id, snapshotting a
 *     specific user's view) must stay non-persistent so they still expire normally.
 *     registerSendable('my_feature:key', () => ({ ... }), { persistent: true })
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
  /** Static, module-load registrations that must survive forever — see the
   *  PERSISTENT doc-comment above. Skipped by both `sweepSendables()` and the
   *  hard-cap eviction loop in `registerSendable`. */
  persistent?: boolean
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
  // Persistent entries never expire — skip them regardless of expiresAt.
  for (const [k, e] of registry) if (!e.persistent && e.expiresAt < now) registry.delete(k)
}

export function registerSendable(
  key: string,
  builder: () => SendablePayload,
  opts?: { persistent?: boolean }
): void {
  const persistent = !!opts?.persistent
  // Sweep expired entries first — cheap and frees space before the hard-cap kicks in.
  if (registry.size > SENDABLE_MAX_ENTRIES) sweepSendables()
  registry.set(key, {
    builder,
    expiresAt: persistent ? Number.POSITIVE_INFINITY : Date.now() + SENDABLE_TTL_MS,
    persistent,
  })
  // Hard-cap regardless of TTL: drop oldest NON-persistent entries (Map
  // iteration is insertion-ordered) until we're back under the limit.
  // Persistent entries are skipped — they're deliberately kept forever, and
  // being the oldest entries in the registry they'd otherwise be the first
  // ones evicted. Belt-and-braces against a flood of new registrations
  // within a single sweep window.
  if (registry.size > SENDABLE_MAX_ENTRIES) {
    for (const [k, e] of registry) {
      if (registry.size <= SENDABLE_MAX_ENTRIES) break
      if (e.persistent) continue
      registry.delete(k)
    }
    // If every remaining entry is persistent, the loop above can't shrink
    // the registry further — that's fine, persistent entries are meant to
    // stay, and there's a hard cap on how many the codebase registers.
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

// ── V2 with arbitrary extra rows ───────────────────────────────────────────
/**
 * Like {@link withSendButtonV2} but supports laying out multiple action rows
 * between the container and the trailing Send-to-Channel row. `extraRows` are
 * rendered as-is (e.g. a command's built-in buttons + a business's custom
 * button rows); `trailingButtons` sit in the final row alongside Send
 * (e.g. a manager-only "Manage Buttons" affordance). Same Ephemeral + V2
 * flags and no-ping allowed-mentions as the single-row variant.
 */
export function withSendButtonV2Rows(
  key: string,
  container: ContainerBuilder,
  extraRows: ActionRowBuilder<ButtonBuilder>[] = [],
  trailingButtons: ButtonBuilder[] = []
) {
  return {
    components: [
      container,
      ...extraRows,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...trailingButtons,
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

  // Persistent entries have expiresAt === POSITIVE_INFINITY, so this check
  // naturally treats them as always valid — no separate branch needed.
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
