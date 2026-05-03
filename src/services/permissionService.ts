import type { GuildMember } from 'discord.js'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { businesses, businessRoleMappings, businessOwners } from '../db/schema'
import type { ResolvedBusiness, StaffRank } from '../types/domain'
import { RANK_ORDER } from '../types/domain'
import { isSudoUser } from './sudoService'

export { isSudoUser }

/**
 * Returns all businesses the member has access to, with their effective rank.
 *
 * Rank is resolved from two sources (highest wins per business):
 *   1. Discord role → business_role_mappings lookup
 *   2. business_owners table (DB-authoritative ownership)
 *
 * Sudo users still go through normal resolution — sudo bypasses are enforced
 * at the command/action level, not here.
 */
export async function resolveBusinesses(member: GuildMember): Promise<ResolvedBusiness[]> {
  const byBusiness = new Map<string, ResolvedBusiness>()

  const guildId = member.guild.id

  // --- 1. Role-based access ---
  const roleIds = [...member.roles.cache.keys()]
  if (roleIds.length > 0) {
    const roleRows = await db
      .select({ business: businesses, rank: businessRoleMappings.rank })
      .from(businessRoleMappings)
      .innerJoin(businesses, eq(businessRoleMappings.businessId, businesses.id))
      .where(
        and(
          inArray(businessRoleMappings.roleId, roleIds),
          eq(businessRoleMappings.guildId, guildId),
          eq(businesses.active, true),
        ),
      )

    for (const row of roleRows) {
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
  }

  // --- 2. DB owner list ---
  const ownerRows = await db
    .select({ business: businesses })
    .from(businessOwners)
    .innerJoin(businesses, eq(businessOwners.businessId, businesses.id))
    .where(
      and(
        eq(businessOwners.discordUserId, member.id),
        eq(businesses.active, true),
      ),
    )

  for (const row of ownerRows) {
    const existing = byBusiness.get(row.business.id)
    if (!existing || RANK_ORDER['owner'] > RANK_ORDER[existing.rank]) {
      byBusiness.set(row.business.id, {
        business: {
          ...row.business,
          settings: (row.business.settings as Record<string, unknown>) ?? null,
        },
        rank: 'owner',
      })
    }
  }

  return [...byBusiness.values()]
}

export function hasMinRank(rank: StaffRank, minimum: StaffRank): boolean {
  return RANK_ORDER[rank] >= RANK_ORDER[minimum]
}

/** Check if the given Discord user ID is a DB-listed owner of a business. */
export async function isBusinessOwner(
  discordUserId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: businessOwners.id })
    .from(businessOwners)
    .where(
      and(
        eq(businessOwners.discordUserId, discordUserId),
        eq(businessOwners.businessId, businessId),
      ),
    )
    .limit(1)
  return rows.length > 0
}
