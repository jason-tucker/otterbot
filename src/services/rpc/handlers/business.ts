/**
 * `business.sync_roles` RPC verb — post-write Discord-role reconciliation.
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
