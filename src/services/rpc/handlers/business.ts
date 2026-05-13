/**
 * Business-domain RPC verbs.
 *
 * ── `business.sync_roles` — post-write Discord-role reconciliation ──
 *
 * The panel edits `business_role_mappings` + `business_owners` from
 * `/otter/businesses/[slug]`. Those edits change the DB but leave actual
 * Discord roles on members untouched. After such an edit, the panel fires
 * this verb so the bot walks the business roster (DB owners ∪ everyone
 * currently holding any mapped role for the business) and reconciles:
 *
 *  - Each member's expected rank is derived from
 *      DB owner → 'owner'
 *      else manager role mapping present → 'manager'
 *      else any employee mapping present → 'employee'
 *      else null (not in business).
 *  - The expected Discord role per rank is the `isBase` mapping for that
 *    rank (or the first one if no isBase) — same logic
 *    `employeeService.getEmployeeBusinessConfig()` uses, so the panel and
 *    `/employee` agree on which role to grant.
 *  - For each member with a non-null expected rank, ensure they have the
 *    expected role and DON'T have any other-rank base roles for this
 *    business. Custom (non-base employee) roles are left alone — the
 *    panel doesn't manage those individually.
 *
 * Everything Discord-side is `.catch(() => null)`'d — one missing-member
 * or hierarchy error never tanks the whole sync. Returns audit counts +
 * a list of userIds that couldn't be resolved.
 *
 * Params: `{ businessSlug: string }` — kebab-case, ≤64 chars.
 * Reply:  `{ok:true, data:{added, removed, skipped[]}} | {ok:false, error}`.
 *
 * ── `business.roster` — read-only member listing grouped by rank ──
 *
 * Powers the panel's per-business Members card. Walks
 * `guild.members.cache` and groups each member into 'owner' / 'manager'
 * / 'employee' based on the `business_role_mappings` role IDs for this
 * business (plus `business_owners` rows for owners). Members holding
 * none of the mapped roles are excluded.
 *
 * Pure cache read on the Discord side — never `.fetch()`s. The bot's
 * GUILD_MEMBERS intent keeps the member cache warm; an empty cache
 * means an empty roster rather than a 1000-member fetch storm.
 *
 * Params: `{ businessSlug: string }` — kebab-case, ≤64 chars. The
 *   McKenzie slug (`mckenzie`) returns `mke-not-supported` because MKE
 *   staff management lives on the external mke.euphoric.gg portal.
 * Reply:  `{ok:true, data:{members:[{userId, username, displayName,
 *   avatarUrl, rank}], counts:{owner, manager, employee}}}`.
 */
import { eq, and } from 'drizzle-orm'
import { db } from '../../../db/client'
import { businesses, businessRoleMappings, businessOwners } from '../../../db/schema'
import { registerVerb, type VerbContext, type VerbResult } from '../registry'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type Rank = 'employee' | 'manager' | 'owner'

interface RoleMappingRow {
  id: string
  roleId: string
  rank: Rank
  isBase: boolean
}

/**
 * Pick the canonical Discord role for a rank: prefer `isBase`, else the
 * first mapping for that rank. Returns null if the business has no
 * mapping for the rank at all — caller skips reconciliation for that
 * rank rather than guessing.
 */
function pickBaseRole(mappings: RoleMappingRow[], rank: Rank): string | null {
  const forRank = mappings.filter((m) => m.rank === rank)
  if (forRank.length === 0) return null
  const base = forRank.find((m) => m.isBase)
  return (base ?? forRank[0]).roleId
}

function isValidSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 && SLUG_RE.test(v)
}

registerVerb('business.sync_roles', async (params, ctx: VerbContext): Promise<VerbResult> => {
  // ── Param validation ───────────────────────────────────────────────
  if (!params || typeof params !== 'object') {
    return { ok: false, error: 'bad-params' }
  }
  const slug = (params as { businessSlug?: unknown }).businessSlug
  if (!isValidSlug(slug)) {
    return { ok: false, error: 'bad-slug' }
  }

  // ── Load business by slug ──────────────────────────────────────────
  const bizRows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  if (bizRows.length === 0) {
    return { ok: false, error: 'business-not-found' }
  }
  const biz = bizRows[0]

  // ── Load owners + mappings ─────────────────────────────────────────
  const [ownerRows, mappingRows] = await Promise.all([
    db
      .select()
      .from(businessOwners)
      .where(eq(businessOwners.businessId, biz.id)),
    db
      .select()
      .from(businessRoleMappings)
      .where(
        and(
          eq(businessRoleMappings.businessId, biz.id),
          eq(businessRoleMappings.guildId, biz.guildId),
        ),
      ),
  ])

  const mappings: RoleMappingRow[] = mappingRows.map((m) => ({
    id: m.id,
    roleId: m.roleId,
    rank: m.rank,
    isBase: m.isBase,
  }))

  // Canonical base role per rank. If a rank has no mapping at all we
  // skip reconciliation for it rather than wiping every member of that
  // rank — a "no manager role" config shouldn't fire-and-forget.
  const baseEmployee = pickBaseRole(mappings, 'employee')
  const baseManager = pickBaseRole(mappings, 'manager')
  const baseOwner = pickBaseRole(mappings, 'owner')

  // ── Fetch the guild ────────────────────────────────────────────────
  const guild = await ctx.client.guilds.fetch(biz.guildId).catch(() => null)
  if (!guild) {
    return { ok: false, error: 'guild-not-found' }
  }

  // The "members in this business" universe is:
  //   - everyone in `business_owners`
  //   - every guild member currently holding any mapped role for this
  //     business (so we can fix wrong-rank role grants too)
  //
  // To enumerate role-holders we use the cached members collection
  // filtered by role membership; we don't `guild.members.fetch()` the
  // whole guild here because that's a 500 K-member hammer on large
  // guilds. The bot keeps members cached via the GUILD_MEMBERS intent.
  const mappedRoleIds = new Set(mappings.map((m) => m.roleId))
  const candidateIds = new Set<string>()
  for (const o of ownerRows) candidateIds.add(o.discordUserId)
  if (mappedRoleIds.size > 0) {
    for (const member of guild.members.cache.values()) {
      for (const rid of member.roles.cache.keys()) {
        if (mappedRoleIds.has(rid)) {
          candidateIds.add(member.id)
          break
        }
      }
    }
  }

  const dbOwnerSet = new Set(ownerRows.map((o) => o.discordUserId))

  let added = 0
  let removed = 0
  const skipped: string[] = []

  for (const userId of candidateIds) {
    // Resolve the member; .fetch() pulls from API if not cached, with a
    // single-member cost. `.catch(() => null)` covers left-the-guild +
    // bad-snowflake + transient API errors.
    const member = await guild.members.fetch(userId).catch(() => null)
    if (!member) {
      skipped.push(userId)
      continue
    }

    // Determine expected rank for this member.
    let expectedRank: Rank | null = null
    if (dbOwnerSet.has(userId)) {
      expectedRank = 'owner'
    } else if (baseManager && member.roles.cache.has(baseManager)) {
      expectedRank = 'manager'
    } else {
      // Any employee-rank mapping role they hold counts as "employee".
      const employeeMappings = mappings.filter((m) => m.rank === 'employee')
      const holdsEmployee = employeeMappings.some((m) => member.roles.cache.has(m.roleId))
      if (holdsEmployee) expectedRank = 'employee'
    }

    if (expectedRank === null) {
      // Holds a mapped role for this business but is neither DB owner,
      // nor manager-role holder, nor any employee mapping — nothing to
      // do (shouldn't really happen given the candidate set, but safe).
      continue
    }

    // ── Reconciliation ────────────────────────────────────────────────
    const expectedRoleId =
      expectedRank === 'owner' ? baseOwner
      : expectedRank === 'manager' ? baseManager
      : baseEmployee

    if (expectedRoleId && !member.roles.cache.has(expectedRoleId)) {
      const ok = await member.roles.add(expectedRoleId).then(() => true).catch(() => null)
      if (ok) added += 1
    }

    // Remove other-rank BASE roles. We don't strip custom (non-base
    // employee) roles — those are operator-curated, not derived from
    // rank, and stripping them would surprise managers using /portal
    // custom-role grants.
    const stripIds: (string | null)[] = []
    if (expectedRank !== 'owner') stripIds.push(baseOwner)
    if (expectedRank !== 'manager') stripIds.push(baseManager)
    if (expectedRank !== 'employee') stripIds.push(baseEmployee)

    for (const rid of stripIds) {
      if (!rid) continue
      if (rid === expectedRoleId) continue
      if (!member.roles.cache.has(rid)) continue
      const ok = await member.roles.remove(rid).then(() => true).catch(() => null)
      if (ok) removed += 1
    }
  }

  return { ok: true, data: { added, removed, skipped } }
})

// ─── business.roster ──────────────────────────────────────────────────
// Read-only member listing for one business, grouped by rank. The panel's
// per-business Members card hits this on render so the operator sees the
// whole staff list (owners + managers + employees) instead of only
// DB-recorded owners.
//
// MKE is explicitly refused — its staff are managed on the external
// mke.euphoric.gg portal, and surfacing a parallel roster here would
// invite divergence. Slug check is the seeded `mckenzie` slug; the older
// `mke` alias is also refused defensively.

type RankedMember = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  rank: Rank
}

const RANK_ORDER: Record<Rank, number> = { owner: 0, manager: 1, employee: 2 }

registerVerb('business.roster', async (params, ctx: VerbContext): Promise<VerbResult> => {
  // ── Param validation ───────────────────────────────────────────────
  if (!params || typeof params !== 'object') {
    return { ok: false, error: 'bad-params' }
  }
  const slug = (params as { businessSlug?: unknown }).businessSlug
  if (!isValidSlug(slug)) {
    return { ok: false, error: 'bad-slug' }
  }

  // MKE / McKenzie is managed externally — no panel roster surface.
  if (slug === 'mckenzie' || slug === 'mke') {
    return { ok: false, error: 'mke-not-supported' }
  }

  // ── Load business by slug ──────────────────────────────────────────
  const bizRows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1)
  if (bizRows.length === 0) {
    return { ok: false, error: 'business-not-found' }
  }
  const biz = bizRows[0]

  // ── Load mappings + owner rows in parallel ─────────────────────────
  const [ownerRows, mappingRows] = await Promise.all([
    db
      .select()
      .from(businessOwners)
      .where(eq(businessOwners.businessId, biz.id)),
    db
      .select()
      .from(businessRoleMappings)
      .where(
        and(
          eq(businessRoleMappings.businessId, biz.id),
          eq(businessRoleMappings.guildId, biz.guildId),
        ),
      ),
  ])

  // Build per-rank role-id sets. Multiple mappings per rank are allowed
  // (e.g. OC has three employee-rank roles), and any one of them counts
  // as "in this rank" for the read-only roster.
  const ownerRoleIds = new Set<string>()
  const managerRoleIds = new Set<string>()
  const employeeRoleIds = new Set<string>()
  for (const m of mappingRows) {
    if (m.rank === 'owner') ownerRoleIds.add(m.roleId)
    else if (m.rank === 'manager') managerRoleIds.add(m.roleId)
    else if (m.rank === 'employee') employeeRoleIds.add(m.roleId)
  }
  const dbOwnerSet = new Set(ownerRows.map((o) => o.discordUserId))

  // ── Resolve the guild ──────────────────────────────────────────────
  const guild = ctx.client.guilds.cache.get(biz.guildId)
  if (!guild) {
    return { ok: false, error: 'guild-not-found' }
  }

  // ── Walk the member cache + classify ───────────────────────────────
  // Pure cache read; no .fetch() — see the verb-level comment for why.
  // We also explicitly union in the DB-owner snowflakes so an owner who
  // somehow doesn't have the owner role (data drift) still shows up.
  const seen = new Set<string>()
  const out: RankedMember[] = []

  function classify(memberRoleIds: Set<string>, userId: string): Rank | null {
    if (dbOwnerSet.has(userId)) return 'owner'
    for (const rid of ownerRoleIds) if (memberRoleIds.has(rid)) return 'owner'
    for (const rid of managerRoleIds) if (memberRoleIds.has(rid)) return 'manager'
    for (const rid of employeeRoleIds) if (memberRoleIds.has(rid)) return 'employee'
    return null
  }

  for (const member of guild.members.cache.values()) {
    if (seen.has(member.id)) continue
    const memberRoleIds = new Set(member.roles.cache.keys())
    const rank = classify(memberRoleIds, member.id)
    if (!rank) continue
    seen.add(member.id)
    out.push({
      userId: member.id,
      username: member.user.username,
      displayName: member.displayName ?? member.user.username,
      avatarUrl: member.displayAvatarURL({ size: 64 }),
      rank,
    })
  }

  // Pick up DB owners not in the member cache (rare — they left the
  // guild but the `business_owners` row wasn't cleaned up). They render
  // with the raw snowflake as displayName so operators can still see +
  // act on them.
  for (const userId of dbOwnerSet) {
    if (seen.has(userId)) continue
    seen.add(userId)
    const user = ctx.client.users.cache.get(userId)
    out.push({
      userId,
      username: user?.username ?? userId,
      displayName: user?.username ?? userId,
      avatarUrl: user ? user.displayAvatarURL({ size: 64 }) : null,
      rank: 'owner',
    })
  }

  // Sort by (rank, displayName). Stable within rank groups so consecutive
  // renders don't shuffle rows.
  out.sort((a, b) => {
    const r = RANK_ORDER[a.rank] - RANK_ORDER[b.rank]
    if (r !== 0) return r
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  })

  const counts = { owner: 0, manager: 0, employee: 0 }
  for (const m of out) counts[m.rank] += 1

  return { ok: true, data: { members: out, counts } }
})

// ────────────────────────────────────────────────────────────────────
// business.user_ranks — given a userId, return their rank in every
// business they hold a role in.
//
// Panel calls this from `loadOtterBusinesses` in lib/auth/perms.ts.
// Manager/employee ranks live exclusively as Discord roles (the
// `business_role_mappings` table has role_id → rank but no user_id),
// so the panel can't derive them from DB alone. Owners are pulled
// from `business_owners` (DB) since they may not always hold the
// Discord owner role.
//
// Pure cache read — zero Discord API hits. The bot keeps guild
// members cached via the GUILD_MEMBERS intent.
// ────────────────────────────────────────────────────────────────────
registerVerb('business.user_ranks', async (params, ctx: VerbContext): Promise<VerbResult> => {
  const p = params as { userId?: unknown } | null
  if (!p || typeof p !== 'object' || typeof p.userId !== 'string' || !/^\d{15,25}$/.test(p.userId)) {
    return { ok: false, error: 'bad-user-id' }
  }
  const userId = p.userId

  let allBusinesses: Array<{ id: string; slug: string; guildId: string }>
  let allMappings: Array<{ businessId: string; roleId: string; rank: string }>
  let dbOwners: Array<{ businessId: string }>
  try {
    allBusinesses = await db
      .select({ id: businesses.id, slug: businesses.slug, guildId: businesses.guildId })
      .from(businesses)
      .where(eq(businesses.active, true))
    allMappings = await db
      .select({
        businessId: businessRoleMappings.businessId,
        roleId: businessRoleMappings.roleId,
        rank: businessRoleMappings.rank,
      })
      .from(businessRoleMappings)
    dbOwners = await db
      .select({ businessId: businessOwners.businessId })
      .from(businessOwners)
      .where(eq(businessOwners.discordUserId, userId))
  } catch (err) {
    return { ok: false, error: 'db-error', details: err instanceof Error ? err.message : String(err) }
  }

  // Index mappings by businessId → {ownerRoles, managerRoles, employeeRoles}
  const mapsByBusiness = new Map<string, { owner: Set<string>; manager: Set<string>; employee: Set<string> }>()
  for (const m of allMappings) {
    let entry = mapsByBusiness.get(m.businessId)
    if (!entry) {
      entry = { owner: new Set(), manager: new Set(), employee: new Set() }
      mapsByBusiness.set(m.businessId, entry)
    }
    if (m.rank === 'owner') entry.owner.add(m.roleId)
    else if (m.rank === 'manager') entry.manager.add(m.roleId)
    else if (m.rank === 'employee') entry.employee.add(m.roleId)
  }

  const dbOwnerBusinessIds = new Set(dbOwners.map((o) => o.businessId))

  // Group businesses by guild so we minimize member-cache lookups.
  const guildIds = new Set(allBusinesses.map((b) => b.guildId))
  const memberRolesByGuild = new Map<string, Set<string>>()
  for (const gid of guildIds) {
    const guild = ctx.client.guilds.cache.get(gid)
    if (!guild) continue
    const member = guild.members.cache.get(userId)
    if (!member) continue
    memberRolesByGuild.set(gid, new Set(member.roles.cache.keys()))
  }

  const ranks: Record<string, 'owner' | 'manager' | 'employee'> = {}

  for (const b of allBusinesses) {
    // DB-owner is the strongest signal — wins over Discord role check.
    if (dbOwnerBusinessIds.has(b.id)) {
      ranks[b.slug] = 'owner'
      continue
    }
    const memberRoleIds = memberRolesByGuild.get(b.guildId)
    if (!memberRoleIds) continue
    const m = mapsByBusiness.get(b.id)
    if (!m) continue

    let rank: 'owner' | 'manager' | 'employee' | null = null
    for (const rid of memberRoleIds) {
      if (m.owner.has(rid)) {
        rank = 'owner'
        break
      }
      // owner branch above always `break`s, so `rank` here is narrowed
      // to 'manager' | 'employee' | null — no need to recheck != 'owner'.
      if (m.manager.has(rid)) rank = 'manager'
      else if (m.employee.has(rid) && rank === null) rank = 'employee'
    }
    if (rank) ranks[b.slug] = rank
  }

  return { ok: true, data: { ranks } }
})
