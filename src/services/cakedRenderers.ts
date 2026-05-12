/**
 * Caked Up Components V2 card renderers — single source of truth for both
 * the `/caked` slash command (and its button handlers) and the panel-driven
 * `caked.message_post` RPC verb.
 *
 * Each renderer returns a fully built `ContainerBuilder`; callers wrap with
 * `MessageFlags.IsComponentsV2` plus whatever action row they want.
 *
 * Color: `#BF889D` (12158877) — Caked Up brand accent.
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
} from 'discord.js'
import { sepLarge, sepBlank, sep } from '../utils/cv2'

export const CAKED_COLOR = 0xbf889d

/**
 * "Have the following information ready" — the headline card the `/caked`
 * slash command posts, listing both contact and event info sections plus a
 * pricing hint. Kept here so the panel can post the same card.
 */
export function cakedMainContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '# Please have the following information ready',
          '',
          '### Contact Information',
          '- Name',
          '- Phone Number',
          '- Bank Number for Order',
          '',
          '### Event Information',
          '- Event Date and Time',
          '- Total people',
          '- Dietary Restrictions',
          '- Items you would like',
          '',
          '> 💰 Use the **Pricing** button below to view our rates.',
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      sepLarge()
    )
}

/**
 * Contact-info card — the "what we need from you" half of the main card.
 * Used by the panel to post a standalone contact-info request.
 */
export function cakedContactInfoContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '# 🎂 Caked Up — Contact Information',
          '',
          'Please have the following ready when you reach out:',
          '',
          '- **Name**',
          '- **Phone Number**',
          '- **Bank Number for Order**',
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
}

/**
 * Event-info card — the "what we need from you" half about the event itself.
 * Used by the panel to post a standalone event-info request.
 */
export function cakedEventInfoContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '# 🎉 Caked Up — Event Information',
          '',
          'Please have the following ready for your event:',
          '',
          '- **Event Date and Time**',
          '- **Total people attending**',
          '- **Dietary Restrictions**',
          '- **Items you would like**',
        ].join('\n')
      )
    )
    .addSeparatorComponents(sep())
}

/**
 * Pricing card — base pricing for cakes / catering / add-ons. Mirrors what
 * `/caked` → "Pricing" button posts. Includes the pricing menu image.
 */
export function cakedPricingContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "Below is our base pricing for Custom Cakes! If you have any questions, or you'd like something not listed, please let us know! You don't have to pay extra to have your cake picked up or delivered, but you will need to pay extra to have your event catered by us!",
          '',
          '# Custom Cake Prices',
          '• **$3,500** — Custom Cake Design *(30 Slices/Cupcakes included)*',
          '• **$2,000** — Rush Order Fee *(Less than 72 hours notice)*',
          '',
          '# Catering Pricing and Fees',
          '• **$500** — 1 Employee for the __First Hour__',
          '• **$1,000** — 1 Employee per additional hour',
          '• **$1,000** — Per Additional Employee',
          '',
          '## Add Ons',
          '• **$300** — Per 20 Slices/Cupcakes',
          '• **$600** — Per 30 Drinks',
        ].join('\n')
      )
    )
    .addSeparatorComponents(
      sepBlank()
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems([
        { media: { url: 'http://i.jasontucker.me/1685847590-Illustrator_TUCKERPC_10_.png' } },
      ])
    )
}

/**
 * Announcement card — free-form text wrapped in the Caked brand container.
 * Used by `caked.message_post` when `kind === 'announcement'`; the `body` is
 * a plain string (≤2000 chars enforced at the call site / handler).
 */
export function cakedAnnouncementContainer(body: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(CAKED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(body)
    )
}
