/**
 * Caked Up Components V2 card renderers — single source of truth for both
 * the `/caked` slash command (and its button handlers) and the panel-driven
 * `caked.message_post` RPC verb.
 *
 * Each renderer returns a fully built `ContainerBuilder`; callers wrap with
 * `MessageFlags.IsComponentsV2` plus whatever action row they want.
 *
 * Color: `#BF889D` (12158877) — Caked Up brand accent.
 *
 * ── Editable text overrides ──────────────────────────────────────────────
 * Each renderer takes an optional `overrides` map keyed by the same strings
 * declared in `businessMessagesService.ts` (`CAKED_DEFAULTS`). When present,
 * the override replaces the hardcoded default body for that text section;
 * when absent, the renderer uses the default string defined inline below.
 * Layout, colors, buttons, and media gallery stay hardcoded — only section
 * BODIES are editable.
 *
 * The set of editable keys this file consumes is re-exported from
 * `businessMessagesService.CAKED_EDITABLE_KEYS` so the panel can render a
 * form per key without re-listing them here.
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
} from 'discord.js'
import { sepLarge, sepBlank, sep } from '../utils/cv2'
import { CAKED_DEFAULTS } from './businessMessagesService'

export const CAKED_COLOR = 0xbf889d

type Overrides = Record<string, string> | undefined

function bodyFor(key: keyof typeof CAKED_DEFAULTS, overrides: Overrides): string {
  if (overrides && overrides[key]) return overrides[key]
  return CAKED_DEFAULTS[key].body
}

/**
 * "Have the following information ready" — the headline card the `/caked`
 * slash command posts, listing both contact and event info sections plus a
 * pricing hint. Kept here so the panel can post the same card.
 */
export function cakedMainContainer(overrides?: Overrides): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyFor('caked.main.body', overrides)),
    )
    .addSeparatorComponents(sepLarge())
}

/**
 * Contact-info card — the "what we need from you" half of the main card.
 * Used by the panel to post a standalone contact-info request.
 */
export function cakedContactInfoContainer(overrides?: Overrides): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyFor('caked.contact.body', overrides)),
    )
    .addSeparatorComponents(sep())
}

/**
 * Event-info card — the "what we need from you" half about the event itself.
 * Used by the panel to post a standalone event-info request.
 */
export function cakedEventInfoContainer(overrides?: Overrides): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyFor('caked.event.body', overrides)),
    )
    .addSeparatorComponents(sep())
}

/**
 * Pricing card — base pricing for cakes / catering / add-ons. Mirrors what
 * `/caked` → "Pricing" button posts. Includes the pricing menu image.
 */
export function cakedPricingContainer(overrides?: Overrides): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyFor('caked.pricing.body', overrides)),
    )
    .addSeparatorComponents(sepBlank())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems([
        { media: { url: 'http://i.jasontucker.me/1685847590-Illustrator_TUCKERPC_10_.png' } },
      ]),
    )
}

/**
 * Announcement card — free-form text wrapped in the Caked brand container.
 * Used by `caked.message_post` when `kind === 'announcement'`; the `body` is
 * a plain string (≤2000 chars enforced at the call site / handler). The
 * announcement body is panel-provided per-call, NOT loaded from
 * `business_messages`, so this renderer has no `overrides` param.
 */
export function cakedAnnouncementContainer(body: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
}
