/**
 * Service layer for the `business_messages` table — the per-business override
 * store for editable card bodies (`/caked` Contact/Event/Pricing, `/oc`
 * Requirements). The renderers in `cakedRenderers.ts` and `embeds/ocEmbed.ts`
 * call `getBusinessMessageOverrides()` before assembling their containers
 * and use `overrides[key] ?? DEFAULT_TEXT` per section.
 *
 * Key allowlist:
 *   The set of valid message keys is defined here (single source of truth).
 *   Each renderer maps a key → a default body string. The RPC verbs gate
 *   writes against the allowlist (`messageKey` not in
 *   `getAllEditableKeys('caked-up')` → `unknown-key` error) so a forged
 *   panel call can't pollute the table with arbitrary keys.
 *
 * Caching:
 *   In-process LRU keyed by `${businessId}:${keysHash}` with a 60s TTL so
 *   the slash-command hot path doesn't hammer Postgres on every button
 *   press. Invalidated on update/reset via `invalidateBusinessMessageCache()`.
 *   60s drift is acceptable — a panel save not showing for ~1m matches the
 *   tone of "edit the card, then post when you're happy".
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { businessMessages, businesses } from '../db/schema'

// ────────────────────────────────────────────────────────────────────────
// Key allowlist — per-business set of editable keys with default bodies.
// Renderers import `getDefaultBody` and `getKeysForSlug` from here.
// ────────────────────────────────────────────────────────────────────────

/**
 * Caked card bodies — one entry per editable text-display section the
 * `/caked` flow renders. Keys are stable strings; bodies are the same
 * hardcoded strings the renderer falls back to when no override exists.
 */
export const CAKED_DEFAULTS: Record<string, { label: string; body: string }> = {
  'caked.contact.body': {
    label: 'Contact Info card',
    body: [
      '# 🎂 Caked Up — Contact Information',
      '',
      'Please have the following ready when you reach out:',
      '',
      '- **Name**',
      '- **Phone Number**',
      '- **Bank Number for Order**',
    ].join('\n'),
  },
  'caked.event.body': {
    label: 'Event Info card',
    body: [
      '# 🎉 Caked Up — Event Information',
      '',
      'Please have the following ready for your event:',
      '',
      '- **Event Date and Time**',
      '- **Total people attending**',
      '- **Dietary Restrictions**',
      '- **Items you would like**',
    ].join('\n'),
  },
  'caked.pricing.body': {
    label: 'Pricing card',
    body: [
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
    ].join('\n'),
  },
  'caked.main.body': {
    label: 'Main /caked card',
    body: [
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
    ].join('\n'),
  },
}

/**
 * OC card bodies — only the Requirements card is editable today. The stock
 * board itself is driven by the `oc_stock` table, not free-form text.
 */
export const OC_DEFAULTS: Record<string, { label: string; body: string }> = {
  'oc.requirements.eligibility': {
    label: 'Requirements — Eligibility',
    body: [
      '**Eligibility**',
      `- Businesses require at least **5 active staff members**; MC/Groups require **8 active members**`,
      `- A valid **Social Club license** and **Business & Premises license** are required`,
      `- Gangs/organizations must have been active for at least **30 days**`,
      `- Recommended: maintain an [active forum post](https://newdayrp.com/forums/gangs-criminal-organizations.67/) for your gang or organization`,
    ].join('\n'),
  },
  'oc.requirements.item_limits': {
    label: 'Requirements — Item Limits',
    body: [
      '**Item Limits**',
      '- Each group starts with a maximum of **3 clothing items** — this is a hard limit',
      '- Groups earn **+1 item per year of activity**, up to a maximum of **5 items total**',
    ].join('\n'),
  },
  'oc.requirements.communication': {
    label: 'Requirements — Communication & Vetting',
    body: [
      '**Communication & Vetting**',
      '- OC requires direct communication with the **owner or leader** of your group',
      '- We work with the Department of Commerce and Labor and run **background checks** on every order to verify activity',
    ].join('\n'),
  },
  'oc.requirements.activity': {
    label: 'Requirements — Activity & Removal',
    body: [
      '**Activity & Removal**',
      '- Activity checks are conducted **weekly or bi-weekly**',
      `- If your activity or member count falls below requirements, you'll be given a **2-week deadline** to recover`,
      '- **1 month of inactivity** will result in clothing removal — contact us beforehand if inactivity is planned',
      '- If your Social Club/Business & Premises license is **terminated**, clothing is removed immediately',
      `- OC reserves the right to remove clothing **with or without notice** for valid reasons (activity, licensing, federal)`,
    ].join('\n'),
  },
  'oc.requirements.licensing': {
    label: 'Requirements — Licensing',
    body: [
      '**Licensing**',
      `-# By authorizing use of your assets on NewDayRP, you permanently and irrevocably waive your copyright and related rights for use on NewDayRP. Asset removal may be requested and will be honoured at OC's discretion.`,
    ].join('\n'),
  },
}

/**
 * Map a business slug to its editable-key dictionary. The panel uses this
 * to render an edit form per key. Unknown slugs return an empty object —
 * the verb caller will surface "no editable keys for this business".
 */
export function getEditableKeysForSlug(
  slug: string,
): Record<string, { label: string; body: string }> {
  if (slug === 'caked-up') return CAKED_DEFAULTS
  if (slug === 'original-clothing') return OC_DEFAULTS
  return {}
}

/** Exported convenience — the `caked.*` keys the renderer reads. */
export const CAKED_EDITABLE_KEYS = Object.keys(CAKED_DEFAULTS)

/** Exported convenience — the `oc.*` keys the renderer reads. */
export const OC_EDITABLE_KEYS = Object.keys(OC_DEFAULTS)

/**
 * Return the default body for a key, falling back to `''` if the key
 * isn't known. Callers should use the renderer-local fallback instead
 * — this is mainly for the RPC list verb when no override exists.
 */
export function getDefaultBody(messageKey: string): string {
  if (messageKey in CAKED_DEFAULTS) return CAKED_DEFAULTS[messageKey].body
  if (messageKey in OC_DEFAULTS) return OC_DEFAULTS[messageKey].body
  return ''
}

// ────────────────────────────────────────────────────────────────────────
// In-process cache — 60s TTL keyed by (businessId, sorted-keys join).
// ────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; value: Record<string, string> }>()

function cacheKey(businessId: string, keys: string[]): string {
  const sorted = [...keys].sort().join(',')
  return `${businessId}:${sorted}`
}

/**
 * Drop every cache entry for a business. Called from the update + reset
 * verbs so the next render sees the fresh value. We invalidate on
 * `businessId` rather than per-key because cache keys are derived from
 * the full key set the renderer reads in one go — a single edit
 * invalidates the whole bag, which is fine at the rendering cadence.
 */
export function invalidateBusinessMessageCache(businessId: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(`${businessId}:`)) cache.delete(k)
  }
}

/**
 * Resolve a business slug → id. The result is cached for the process
 * lifetime — slugs don't move once seeded, and `/portal` deactivate
 * doesn't change the row's id. Falls back to a live query on miss; on
 * DB error returns `null` so the renderer can skip override lookup
 * rather than crash.
 */
const slugIdCache = new Map<string, string>()

export async function resolveBusinessIdBySlug(slug: string): Promise<string | null> {
  const hit = slugIdCache.get(slug)
  if (hit) return hit
  try {
    const rows = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1)
    if (rows.length === 0) return null
    slugIdCache.set(slug, rows[0].id)
    return rows[0].id
  } catch (err) {
    console.warn('[businessMessagesService] resolveBusinessIdBySlug failed', err)
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────

/**
 * Look up overrides for a set of message keys for a given business. Returns
 * `{ key: body }` for every key with a stored override; missing keys are
 * omitted (caller falls back to the renderer's default).
 *
 * One SQL: `WHERE business_id = $1 AND message_key = ANY($2)`. On DB error
 * we return `{}` and log — the renderer falls back to defaults rather than
 * crashing the slash-command response.
 */
export async function getBusinessMessageOverrides(
  businessId: string,
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {}

  const ck = cacheKey(businessId, keys)
  const hit = cache.get(ck)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value
  }

  try {
    const rows = await db
      .select({ key: businessMessages.messageKey, body: businessMessages.body })
      .from(businessMessages)
      .where(
        and(
          eq(businessMessages.businessId, businessId),
          inArray(businessMessages.messageKey, keys),
        ),
      )
    const out: Record<string, string> = {}
    for (const r of rows) out[r.key] = r.body
    cache.set(ck, { at: Date.now(), value: out })
    return out
  } catch (err) {
    // Don't throw — the renderer should fall back to hardcoded defaults
    // rather than 500 the slash command.
    console.warn('[businessMessagesService] read failed', err)
    return {}
  }
}

// ────────────────────────────────────────────────────────────────────────
// Writes (used by RPC verbs)
// ────────────────────────────────────────────────────────────────────────

/**
 * Upsert a single override. Returns the row's `body` + `updatedAt` after
 * write so the caller can echo back. Throws on DB error so the verb can
 * surface it.
 */
export async function upsertBusinessMessage(
  businessId: string,
  messageKey: string,
  body: string,
  updatedByDiscordId: string | null,
): Promise<{ key: string; body: string; updatedAt: Date }> {
  const rows = await db
    .insert(businessMessages)
    .values({
      businessId,
      messageKey,
      body,
      updatedByDiscordId: updatedByDiscordId ?? null,
    })
    .onConflictDoUpdate({
      target: [businessMessages.businessId, businessMessages.messageKey],
      set: {
        body,
        updatedAt: sql`now()`,
        updatedByDiscordId: updatedByDiscordId ?? null,
      },
    })
    .returning({
      key: businessMessages.messageKey,
      body: businessMessages.body,
      updatedAt: businessMessages.updatedAt,
    })

  invalidateBusinessMessageCache(businessId)
  return rows[0]
}

/**
 * Delete a single override — the next render falls back to the renderer's
 * hardcoded default. Returns `true` if a row was deleted.
 */
export async function deleteBusinessMessage(
  businessId: string,
  messageKey: string,
): Promise<boolean> {
  const rows = await db
    .delete(businessMessages)
    .where(
      and(
        eq(businessMessages.businessId, businessId),
        eq(businessMessages.messageKey, messageKey),
      ),
    )
    .returning({ id: businessMessages.id })
  invalidateBusinessMessageCache(businessId)
  return rows.length > 0
}

// ────────────────────────────────────────────────────────────────────────
// Listing for the panel
// ────────────────────────────────────────────────────────────────────────

export interface BusinessMessageListItem {
  key: string
  label: string
  body: string
  defaultBody: string
  isOverride: boolean
  updatedAt: Date | null
  updatedByDiscordId: string | null
}

/**
 * Return every editable key for the business slug, merged with any stored
 * overrides. Keys with no override row have `isOverride: false` and `body
 * === defaultBody`.
 */
export async function listBusinessMessages(
  businessSlug: string,
): Promise<{ businessId: string; items: BusinessMessageListItem[] } | null> {
  const bizRows = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1)
  if (bizRows.length === 0) return null
  const businessId = bizRows[0].id

  const dict = getEditableKeysForSlug(businessSlug)
  const keys = Object.keys(dict)
  if (keys.length === 0) {
    return { businessId, items: [] }
  }

  const rows = await db
    .select({
      key: businessMessages.messageKey,
      body: businessMessages.body,
      updatedAt: businessMessages.updatedAt,
      updatedByDiscordId: businessMessages.updatedByDiscordId,
    })
    .from(businessMessages)
    .where(
      and(
        eq(businessMessages.businessId, businessId),
        inArray(businessMessages.messageKey, keys),
      ),
    )

  const byKey = new Map<string, (typeof rows)[number]>()
  for (const r of rows) byKey.set(r.key, r)

  const items: BusinessMessageListItem[] = keys.map((k) => {
    const def = dict[k]
    const override = byKey.get(k)
    return {
      key: k,
      label: def.label,
      body: override?.body ?? def.body,
      defaultBody: def.body,
      isOverride: !!override,
      updatedAt: override?.updatedAt ?? null,
      updatedByDiscordId: override?.updatedByDiscordId ?? null,
    }
  })

  return { businessId, items }
}
