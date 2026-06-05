/**
 * Service layer for the `business_buttons` table — manager-configurable custom
 * buttons appended to a business's slash command output (`/oc`, `/caked`,
 * `/info`).
 *
 * Reads go through a small in-process cache (30 s TTL keyed by businessId) so
 * the slash-command hot path doesn't hit Postgres on every invocation. Writes
 * invalidate the business's cache entry immediately. The RPC verbs and the
 * in-Discord manage panel both validate manager+ rank before calling the
 * mutating helpers here — this module trusts its callers and only does light
 * shape clamping.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { businessButtons } from '../db/schema'

export type BusinessButtonType = 'link' | 'info'
export type BusinessButtonStyle = 'primary' | 'secondary' | 'success' | 'danger'

export interface BusinessButton {
  id: string
  businessId: string
  type: BusinessButtonType
  label: string
  emoji: string | null
  style: BusinessButtonStyle
  url: string | null
  body: string | null
  sortOrder: number
  enabled: boolean
}

// Limits — enforced at the input edges (modal handler + RPC) and surfaced to
// the user. Re-exported so those edges share one source of truth.
export const MAX_BUTTONS_PER_BUSINESS = 10
export const MAX_LABEL_LEN = 80
export const MAX_EMOJI_LEN = 64
export const MAX_URL_LEN = 512
export const MAX_BODY_LEN = 4000

export const BUTTON_STYLES: readonly BusinessButtonStyle[] = [
  'primary',
  'secondary',
  'success',
  'danger',
]

export interface NewButtonFields {
  type: BusinessButtonType
  label: string
  emoji?: string | null
  style?: BusinessButtonStyle
  url?: string | null
  body?: string | null
}

export interface UpdateButtonFields {
  label?: string
  emoji?: string | null
  style?: BusinessButtonStyle
  url?: string | null
  body?: string | null
  enabled?: boolean
}

// ────────────────────────────────────────────────────────────────────────
// Cache — 30 s TTL keyed by businessId. Stores the full ordered list (both
// enabled and disabled); render paths filter `enabled` themselves.
// ────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { at: number; value: BusinessButton[] }>()

export function invalidateBusinessButtonsCache(businessId: string): void {
  cache.delete(businessId)
}

function rowTo(r: typeof businessButtons.$inferSelect): BusinessButton {
  return {
    id: r.id,
    businessId: r.businessId,
    type: r.type as BusinessButtonType,
    label: r.label,
    emoji: r.emoji ?? null,
    style: r.style as BusinessButtonStyle,
    url: r.url ?? null,
    body: r.body ?? null,
    sortOrder: r.sortOrder,
    enabled: r.enabled,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────

/**
 * All configured buttons for a business, ordered by sortOrder then created.
 * Returns `[]` on DB error so the slash command falls back to a button-less
 * card rather than 500-ing.
 */
export async function listButtons(businessId: string): Promise<BusinessButton[]> {
  const hit = cache.get(businessId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  try {
    const rows = await db
      .select()
      .from(businessButtons)
      .where(eq(businessButtons.businessId, businessId))
      .orderBy(asc(businessButtons.sortOrder), asc(businessButtons.createdAt))
    const value = rows.map(rowTo)
    cache.set(businessId, { at: Date.now(), value })
    return value
  } catch (err) {
    console.warn('[businessButtonsService] listButtons failed', err)
    return []
  }
}

/** Convenience — only the buttons that should render on the command. */
export async function listEnabledButtons(businessId: string): Promise<BusinessButton[]> {
  return (await listButtons(businessId)).filter((b) => b.enabled)
}

export async function getButton(id: string): Promise<BusinessButton | null> {
  const rows = await db.select().from(businessButtons).where(eq(businessButtons.id, id)).limit(1)
  return rows[0] ? rowTo(rows[0]) : null
}

export async function countButtons(businessId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(businessButtons)
    .where(eq(businessButtons.businessId, businessId))
  return rows[0]?.n ?? 0
}

// ────────────────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────────────────

export type AddResult =
  | { ok: true; button: BusinessButton }
  | { ok: false; error: 'limit-reached' }

/**
 * Insert a button at the end of the order. Enforces the per-business cap.
 * sortOrder is derived atomically inside the INSERT so two concurrent adds
 * can't collide on the same MAX.
 */
export async function addButton(
  businessId: string,
  fields: NewButtonFields,
  actorDiscordId: string | null,
): Promise<AddResult> {
  if ((await countButtons(businessId)) >= MAX_BUTTONS_PER_BUSINESS) {
    return { ok: false, error: 'limit-reached' }
  }

  const rows = await db
    .insert(businessButtons)
    .values({
      businessId,
      type: fields.type,
      label: fields.label.trim().slice(0, MAX_LABEL_LEN),
      emoji: fields.emoji?.trim() || null,
      style: fields.style ?? 'primary',
      url: fields.type === 'link' ? (fields.url ?? null) : null,
      body: fields.type === 'info' ? (fields.body ?? null) : null,
      sortOrder: sql<number>`COALESCE((SELECT MAX(${businessButtons.sortOrder}) FROM ${businessButtons} WHERE ${businessButtons.businessId} = ${businessId}), 0) + 1`,
      createdByDiscordId: actorDiscordId,
      updatedByDiscordId: actorDiscordId,
    })
    .returning()

  invalidateBusinessButtonsCache(businessId)
  return { ok: true, button: rowTo(rows[0]) }
}

/**
 * Patch the mutable fields of a button. Only the keys present in `fields` are
 * written. `url`/`body` are kept consistent with the (immutable) type at the
 * call sites — this helper writes whatever it's given.
 */
export async function updateButton(
  id: string,
  fields: UpdateButtonFields,
  actorDiscordId: string | null,
): Promise<BusinessButton | null> {
  const patch: Partial<typeof businessButtons.$inferInsert> = {
    updatedAt: new Date(),
    updatedByDiscordId: actorDiscordId,
  }
  if (fields.label !== undefined) patch.label = fields.label.trim().slice(0, MAX_LABEL_LEN)
  if (fields.emoji !== undefined) patch.emoji = fields.emoji?.trim() || null
  if (fields.style !== undefined) patch.style = fields.style
  if (fields.url !== undefined) patch.url = fields.url
  if (fields.body !== undefined) patch.body = fields.body
  if (fields.enabled !== undefined) patch.enabled = fields.enabled

  const rows = await db
    .update(businessButtons)
    .set(patch)
    .where(eq(businessButtons.id, id))
    .returning()
  if (!rows[0]) return null
  invalidateBusinessButtonsCache(rows[0].businessId)
  return rowTo(rows[0])
}

export async function removeButton(id: string): Promise<boolean> {
  const rows = await db
    .delete(businessButtons)
    .where(eq(businessButtons.id, id))
    .returning({ businessId: businessButtons.businessId })
  if (!rows[0]) return false
  invalidateBusinessButtonsCache(rows[0].businessId)
  return true
}

/**
 * Swap a button with its neighbour in the configured order. Returns false if
 * the button is already at the relevant edge (no neighbour to swap with).
 */
export async function moveButton(
  businessId: string,
  id: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const ordered = await listButtons(businessId)
  const idx = ordered.findIndex((b) => b.id === id)
  if (idx === -1) return false
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= ordered.length) return false

  const a = ordered[idx]
  const b = ordered[swapIdx]
  await db.transaction(async (tx) => {
    await tx.update(businessButtons).set({ sortOrder: b.sortOrder }).where(eq(businessButtons.id, a.id))
    await tx.update(businessButtons).set({ sortOrder: a.sortOrder }).where(eq(businessButtons.id, b.id))
  })
  invalidateBusinessButtonsCache(businessId)
  return true
}

/**
 * Rewrite the full order from an explicit id list (panel drag/up-down). Any
 * ids not belonging to the business are ignored; missing ids keep their
 * existing sortOrder relative to the rewritten ones.
 */
export async function reorderButtons(businessId: string, orderedIds: string[]): Promise<void> {
  const existing = await listButtons(businessId)
  const valid = new Set(existing.map((b) => b.id))
  const ids = orderedIds.filter((id) => valid.has(id))
  if (ids.length === 0) return
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(businessButtons)
        .set({ sortOrder: i + 1 })
        .where(and(eq(businessButtons.id, ids[i]), eq(businessButtons.businessId, businessId)))
    }
  })
  invalidateBusinessButtonsCache(businessId)
}
