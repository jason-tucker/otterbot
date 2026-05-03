import type { GuildMember } from 'discord.js'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { businesses, businessRoleMappings } from '../db/schema'
import type { ResolvedBusiness, StaffRank } from '../types/domain'
import { RANK_ORDER } from '../types/domain'
import { env } from '../config/env'

export function isPortalAdmin(member: GuildMember): boolean {
  if (!env.DISCORD_PORTAL_ADMIN_ROLE_ID) return false
  return member.roles.cache.has(env.DISCORD_PORTAL_ADMIN_ROLE_ID)
}

export async function resolveBusinesses(member: GuildMember): Promise<ResolvedBusiness[]> {
  const roleIds = [...member.roles.cache.keys()]
  if (roleIds.length === 0) return []

  const rows = await db
    .select({
      business: businesses,
      rank: businessRoleMappings.rank,
    })
    .from(businessRoleMappings)
    .innerJoin(businesses, eq(businessRoleMappings.businessId, businesses.id))
    .where(
      and(
        inArray(businessRoleMappings.roleId, roleIds),
        eq(businesses.active, true)
      )
    )

  // Deduplicate: per business, keep highest rank
  const byBusiness = new Map<string, ResolvedBusiness>()
  for (const row of rows) {
    const existing = byBusiness.get(row.business.id)
    if (!existing || RANK_ORDER[row.rank] > RANK_ORDER[existing.rank]) {
      byBusiness.set(row.business.id, {
        business: {
          ...row.business,
          settings: (row.business.settings as Record<string, unknown>) ?? null,
        },
        rank: row.rank,
      })
    }
  }

  return [...byBusiness.values()]
}

export function hasMinRank(rank: StaffRank, minimum: StaffRank): boolean {
  return RANK_ORDER[rank] >= RANK_ORDER[minimum]
}
