/**
 * `business_buttons.*` RPC verbs — read/write a business's custom command
 * buttons. Backs the buttons editor on the panel's
 * `/otter/businesses/[slug]` page.
 *
 * Verbs:
 *   business_buttons.list    ({businessSlug, actorUserId})              → list
 *   business_buttons.create  ({businessSlug, type, label, emoji?,
 *                              style?, url?, body?, actorUserId})        → button
 *   business_buttons.update  ({businessSlug, id, label?, emoji?, style?,
 *                              url?, body?, enabled?, actorUserId})      → button
 *   business_buttons.delete  ({businessSlug, id, actorUserId})          → {deleted}
 *   business_buttons.reorder ({businessSlug, orderedIds, actorUserId})  → {ok}
 *
 * Every verb re-verifies the actor is manager+ for the resolved business
 * bot-side (DB owner OR a manager/owner-rank role in the business's guild) so
 * a leaked HMAC secret alone can't forge a write. The permission helpers
 * mirror `business_messages.ts` — kept self-contained per the handler
 * convention rather than importing the bot-internal permission service.
 *
 * Registers at module load — `rpcServer.ts` does a side-effect import.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../../db/client'
import { businesses, businessRoleMappings, businessOwners } from '../../../db/schema'
import { env } from '../../../config/env'
import { registerVerb, type VerbContext, type VerbResult } from '../registry'
import { parseHttpUrl } from '../../../utils/validators'
import {
  addButton,
  getButton,
  listButtons,
  removeButton,
  reorderButtons,
  updateButton,
  BUTTON_STYLES,
  MAX_BODY_LEN,
  MAX_EMOJI_LEN,
  MAX_LABEL_LEN,
  type BusinessButton,
  type BusinessButtonStyle,
  type BusinessButtonType,
  type UpdateButtonFields,
} from '../../businessButtonsService'

const SNOWFLAKE_RE = /^\d{17,20}$/ /* canonical Discord snowflake; was {15,25} */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Rank = 'employee' | 'manager' | 'owner'

interface ResolvedBiz {
  id: string
  slug: string
  guildId: string
}

async function loadBusinessBySlug(slug: string): Promise<ResolvedBiz | null> {
  const rows = await db
    .select({ id: businesses.id, slug: businesses.slug, guildId: businesses.guildId, active: businesses.active })
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  if (rows.length === 0) return null
  if (!rows[0].active) return null
  return { id: rows[0].id, slug: rows[0].slug, guildId: rows[0].guildId }
}

async function actorRankForBusiness(
  ctx: VerbContext,
  biz: ResolvedBiz,
  actorUserId: string,
): Promise<Rank | null> {
  // Bot owner (env `BOT_OWNER_ID`) is the panel's super-admin and bypasses
  // every per-business rank check on the panel side via `access.botOwner`.
  // Mirror that here so the bot returns the same answer the panel would —
  // otherwise the panel renders the buttons editor (viewerCanManageButtons via
  // botOwner) but every `business_buttons.*` call comes back forbidden. Matches
  // the bypass in `business_messages.ts`.
  if (env.BOT_OWNER_ID && actorUserId === env.BOT_OWNER_ID) return 'owner'

  const ownerRows = await db
    .select({ id: businessOwners.id })
    .from(businessOwners)
    .where(and(eq(businessOwners.businessId, biz.id), eq(businessOwners.discordUserId, actorUserId)))
    .limit(1)
  if (ownerRows.length > 0) return 'owner'

  const guild = ctx.client.guilds.cache.get(biz.guildId)
  if (!guild) return null
  const member =
    guild.members.cache.get(actorUserId) ??
    (await guild.members.fetch(actorUserId).catch(() => null))
  if (!member) return null

  const memberRoleIds = [...member.roles.cache.keys()]
  if (memberRoleIds.length === 0) return null

  const mappings = await db
    .select({ roleId: businessRoleMappings.roleId, rank: businessRoleMappings.rank })
    .from(businessRoleMappings)
    .where(
      and(
        eq(businessRoleMappings.businessId, biz.id),
        eq(businessRoleMappings.guildId, biz.guildId),
        inArray(businessRoleMappings.roleId, memberRoleIds),
      ),
    )

  const order: Record<Rank, number> = { employee: 1, manager: 2, owner: 3 }
  let best: Rank | null = null
  for (const m of mappings) {
    if (!best || order[m.rank] > order[best]) best = m.rank
  }
  return best
}

function asRecord(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  return params as Record<string, unknown>
}

function isVerbResult(v: unknown): v is VerbResult {
  return !!v && typeof v === 'object' && 'ok' in (v as Record<string, unknown>)
}

function validateActor(obj: Record<string, unknown>): { actorUserId: string } | VerbResult {
  const actorUserId = obj.actorUserId
  if (typeof actorUserId !== 'string' || !SNOWFLAKE_RE.test(actorUserId)) {
    return { ok: false, error: 'invalid-actor-user-id' }
  }
  return { actorUserId }
}

function validateSlug(obj: Record<string, unknown>): { businessSlug: string } | VerbResult {
  const businessSlug = obj.businessSlug
  if (typeof businessSlug !== 'string' || businessSlug.length === 0 || businessSlug.length > 64 || !SLUG_RE.test(businessSlug)) {
    return { ok: false, error: 'invalid-business-slug' }
  }
  return { businessSlug }
}

/** Common preamble — validate actor+slug, resolve business, gate manager+. */
async function gate(
  obj: Record<string, unknown>,
  ctx: VerbContext,
): Promise<{ biz: ResolvedBiz; actorUserId: string } | VerbResult> {
  const slug = validateSlug(obj)
  if (isVerbResult(slug)) return slug
  const actor = validateActor(obj)
  if (isVerbResult(actor)) return actor

  const biz = await loadBusinessBySlug(slug.businessSlug)
  if (!biz) return { ok: false, error: 'business-not-found' }

  const rank = await actorRankForBusiness(ctx, biz, actor.actorUserId)
  if (rank !== 'manager' && rank !== 'owner') return { ok: false, error: 'forbidden' }

  return { biz, actorUserId: actor.actorUserId }
}

function serialize(b: BusinessButton) {
  return {
    id: b.id,
    type: b.type,
    label: b.label,
    emoji: b.emoji,
    style: b.style,
    url: b.url,
    body: b.body,
    sortOrder: b.sortOrder,
    enabled: b.enabled,
  }
}

function validateStyle(v: unknown): BusinessButtonStyle | null {
  return typeof v === 'string' && (BUTTON_STYLES as readonly string[]).includes(v)
    ? (v as BusinessButtonStyle)
    : null
}

// ────────────────────────────────────────────────────────────────────────
// list
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_buttons.list', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const g = await gate(obj, ctx)
  if (isVerbResult(g)) return g

  const buttons = await listButtons(g.biz.id)
  return { ok: true, data: { businessSlug: g.biz.slug, buttons: buttons.map(serialize) } }
})

// ────────────────────────────────────────────────────────────────────────
// create
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_buttons.create', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const g = await gate(obj, ctx)
  if (isVerbResult(g)) return g

  const type: BusinessButtonType | null =
    obj.type === 'link' || obj.type === 'info' ? obj.type : null
  if (!type) return { ok: false, error: 'invalid-type' }

  const label = typeof obj.label === 'string' ? obj.label.trim() : ''
  if (label.length < 1 || label.length > MAX_LABEL_LEN) return { ok: false, error: 'invalid-label' }

  const emoji =
    obj.emoji == null ? null : typeof obj.emoji === 'string' && obj.emoji.length <= MAX_EMOJI_LEN ? obj.emoji.trim() || null : undefined
  if (emoji === undefined) return { ok: false, error: 'invalid-emoji' }

  const style = obj.style == null ? 'primary' : validateStyle(obj.style)
  if (!style) return { ok: false, error: 'invalid-style' }

  let url: string | null = null
  let body: string | null = null
  if (type === 'link') {
    url = parseHttpUrl(obj.url)
    if (!url) return { ok: false, error: 'invalid-url' }
  } else {
    body = typeof obj.body === 'string' ? obj.body : ''
    if (body.length < 1 || body.length > MAX_BODY_LEN) return { ok: false, error: 'invalid-body' }
  }

  const result = await addButton(g.biz.id, { type, label, emoji, style, url, body }, g.actorUserId)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: { button: serialize(result.button) } }
})

// ────────────────────────────────────────────────────────────────────────
// update
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_buttons.update', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const g = await gate(obj, ctx)
  if (isVerbResult(g)) return g

  const id = typeof obj.id === 'string' && UUID_RE.test(obj.id) ? obj.id : null
  if (!id) return { ok: false, error: 'invalid-id' }

  const existing = await getButton(id)
  if (!existing || existing.businessId !== g.biz.id) return { ok: false, error: 'not-found' }

  const patch: UpdateButtonFields = {}

  if (obj.label !== undefined) {
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    if (label.length < 1 || label.length > MAX_LABEL_LEN) return { ok: false, error: 'invalid-label' }
    patch.label = label
  }
  if (obj.emoji !== undefined) {
    if (obj.emoji === null) patch.emoji = null
    else if (typeof obj.emoji === 'string' && obj.emoji.length <= MAX_EMOJI_LEN) patch.emoji = obj.emoji.trim() || null
    else return { ok: false, error: 'invalid-emoji' }
  }
  if (obj.style !== undefined) {
    const style = validateStyle(obj.style)
    if (!style) return { ok: false, error: 'invalid-style' }
    patch.style = style
  }
  if (obj.enabled !== undefined) {
    if (typeof obj.enabled !== 'boolean') return { ok: false, error: 'invalid-enabled' }
    patch.enabled = obj.enabled
  }
  if (obj.url !== undefined && existing.type === 'link') {
    const url = parseHttpUrl(obj.url)
    if (!url) return { ok: false, error: 'invalid-url' }
    patch.url = url
  }
  if (obj.body !== undefined && existing.type === 'info') {
    const body = typeof obj.body === 'string' ? obj.body : ''
    if (body.length < 1 || body.length > MAX_BODY_LEN) return { ok: false, error: 'invalid-body' }
    patch.body = body
  }

  const updated = await updateButton(id, patch, g.actorUserId)
  if (!updated) return { ok: false, error: 'not-found' }
  return { ok: true, data: { button: serialize(updated) } }
})

// ────────────────────────────────────────────────────────────────────────
// delete
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_buttons.delete', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const g = await gate(obj, ctx)
  if (isVerbResult(g)) return g

  const id = typeof obj.id === 'string' && UUID_RE.test(obj.id) ? obj.id : null
  if (!id) return { ok: false, error: 'invalid-id' }

  const existing = await getButton(id)
  if (!existing || existing.businessId !== g.biz.id) return { ok: false, error: 'not-found' }

  const deleted = await removeButton(id)
  return { ok: true, data: { id, deleted } }
})

// ────────────────────────────────────────────────────────────────────────
// reorder
// ────────────────────────────────────────────────────────────────────────

registerVerb('business_buttons.reorder', async (params, ctx) => {
  const obj = asRecord(params)
  if (!obj) return { ok: false, error: 'invalid-params' }
  const g = await gate(obj, ctx)
  if (isVerbResult(g)) return g

  const raw = obj.orderedIds
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
    return { ok: false, error: 'invalid-ordered-ids' }
  }

  await reorderButtons(g.biz.id, raw as string[])
  const buttons = await listButtons(g.biz.id)
  return { ok: true, data: { buttons: buttons.map(serialize) } }
})
