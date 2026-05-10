import { eq, and } from 'drizzle-orm'
import { db } from '../db/client'
import { businesses, businessRoleMappings, businessOwners } from '../db/schema'
import type { StaffRank } from '../types/domain'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusinessRecord {
  id: string
  name: string
  slug: string
  providerType: 'mckenzie' | 'discord-only'
  guildId: string
  active: boolean
  settings: Record<string, unknown>
  createdAt: Date
  createdBy: string | null
  updatedAt: Date | null
  updatedBy: string | null
  deactivatedAt: Date | null
  deactivatedBy: string | null
}

export interface RoleMappingRecord {
  id: string
  businessId: string
  guildId: string
  roleId: string
  roleName: string | null
  rank: StaffRank
  label: string | null
  isBase: boolean
  autoGrantEmployee: boolean
  minRankToAssign: StaffRank
}

export interface BusinessOwnerRecord {
  id: string
  businessId: string
  discordUserId: string
  addedByDiscordId: string
  addedAt: Date
}

export interface BusinessSettings {
  managersCanPromote?: boolean
  managersCanAssignCustomRoles?: boolean
  ownersCanManageOwners?: boolean
  higherRolesAutoGrantEmployee?: boolean
  allowOwnerRoleFallback?: boolean
  apiBusinessName?: string
  apiEnabled?: boolean
}

// ---------------------------------------------------------------------------
// Business CRUD
// ---------------------------------------------------------------------------

export async function getAllBusinesses(guildId: string): Promise<BusinessRecord[]> {
  const rows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.guildId, guildId))
    .orderBy(businesses.name)
  return rows.map(toBusinessRecord)
}

export async function getBusinessById(id: string): Promise<BusinessRecord | null> {
  const rows = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1)
  return rows.length > 0 ? toBusinessRecord(rows[0]) : null
}

export async function createBusiness(params: {
  name: string
  slug: string
  providerType: 'mckenzie' | 'discord-only'
  guildId: string
  settings?: BusinessSettings
  createdBy: string
}): Promise<BusinessRecord> {
  const rows = await db
    .insert(businesses)
    .values({
      name: params.name,
      slug: params.slug,
      providerType: params.providerType,
      guildId: params.guildId,
      active: true,
      settings: (params.settings ?? {}) as Record<string, unknown>,
      createdBy: params.createdBy,
    })
    .returning()
  if (params.providerType === 'mckenzie') {
    const { invalidateKnownMckenzieBusinesses } = await import('./mckenzieBusinessCache')
    invalidateKnownMckenzieBusinesses()
  }
  return toBusinessRecord(rows[0])
}

export async function updateBusinessBasic(
  id: string,
  params: {
    name?: string
    slug?: string
    providerType?: 'mckenzie' | 'discord-only'
    updatedBy: string
  },
): Promise<void> {
  await db
    .update(businesses)
    .set({
      ...(params.name !== undefined && { name: params.name }),
      ...(params.slug !== undefined && { slug: params.slug }),
      ...(params.providerType !== undefined && { providerType: params.providerType }),
      updatedAt: new Date(),
      updatedBy: params.updatedBy,
    })
    .where(eq(businesses.id, id))
  // The MKE business cache derives its keys from name/providerType — bust it
  // so a rename is reflected on the next /lookup instead of waiting up to 60 s.
  const { invalidateKnownMckenzieBusinesses } = await import('./mckenzieBusinessCache')
  invalidateKnownMckenzieBusinesses()
}

export async function updateBusinessSettings(
  id: string,
  settings: BusinessSettings,
  updatedBy: string,
): Promise<void> {
  const current = await getBusinessById(id)
  const merged = { ...(current?.settings ?? {}), ...settings }
  await db
    .update(businesses)
    .set({ settings: merged as Record<string, unknown>, updatedAt: new Date(), updatedBy })
    .where(eq(businesses.id, id))
  // settings.apiBusinessName feeds the MKE cache lookup — bust on every
  // settings write to be safe (cheap; cache rebuilds on next /lookup).
  const { invalidateKnownMckenzieBusinesses } = await import('./mckenzieBusinessCache')
  invalidateKnownMckenzieBusinesses()
}

export async function toggleBusinessSetting(
  id: string,
  flag: keyof BusinessSettings,
  updatedBy: string,
): Promise<boolean> {
  const current = await getBusinessById(id)
  const currentVal = Boolean((current?.settings ?? {})[flag] ?? false)
  const newVal = !currentVal
  await updateBusinessSettings(id, { [flag]: newVal }, updatedBy)
  return newVal
}

export async function deactivateBusiness(id: string, deactivatedBy: string): Promise<void> {
  await db
    .update(businesses)
    .set({ active: false, deactivatedAt: new Date(), deactivatedBy, updatedAt: new Date(), updatedBy: deactivatedBy })
    .where(eq(businesses.id, id))
  const { invalidateKnownMckenzieBusinesses } = await import('./mckenzieBusinessCache')
  invalidateKnownMckenzieBusinesses()
}

export async function reactivateBusiness(id: string, reactivatedBy: string): Promise<void> {
  await db
    .update(businesses)
    .set({
      active: true,
      deactivatedAt: null,
      deactivatedBy: null,
      updatedAt: new Date(),
      updatedBy: reactivatedBy,
    })
    .where(eq(businesses.id, id))
}

// ---------------------------------------------------------------------------
// Role mappings
// ---------------------------------------------------------------------------

export async function getRoleMappings(businessId: string, guildId: string): Promise<RoleMappingRecord[]> {
  const rows = await db
    .select()
    .from(businessRoleMappings)
    .where(
      and(
        eq(businessRoleMappings.businessId, businessId),
        eq(businessRoleMappings.guildId, guildId),
      ),
    )
  return rows.map(toRoleMappingRecord)
}

export async function addRoleMapping(params: {
  businessId: string
  guildId: string
  roleId: string
  roleName: string
  rank: StaffRank
  label: string
  isBase: boolean
  autoGrantEmployee: boolean
  minRankToAssign: StaffRank
}): Promise<RoleMappingRecord> {
  const rows = await db
    .insert(businessRoleMappings)
    .values(params)
    .onConflictDoUpdate({
      target: [businessRoleMappings.guildId, businessRoleMappings.roleId],
      set: {
        roleName: params.roleName,
        rank: params.rank,
        label: params.label,
        isBase: params.isBase,
        autoGrantEmployee: params.autoGrantEmployee,
        minRankToAssign: params.minRankToAssign,
        businessId: params.businessId,
      },
    })
    .returning()
  return toRoleMappingRecord(rows[0])
}

export async function updateRoleMapping(
  mappingId: string,
  params: Partial<{
    roleName: string
    rank: StaffRank
    label: string
    isBase: boolean
    autoGrantEmployee: boolean
    minRankToAssign: StaffRank
  }>,
): Promise<void> {
  await db
    .update(businessRoleMappings)
    .set(params)
    .where(eq(businessRoleMappings.id, mappingId))
}

export async function removeRoleMapping(mappingId: string): Promise<void> {
  await db.delete(businessRoleMappings).where(eq(businessRoleMappings.id, mappingId))
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export async function getBusinessOwners(businessId: string): Promise<BusinessOwnerRecord[]> {
  const rows = await db
    .select()
    .from(businessOwners)
    .where(eq(businessOwners.businessId, businessId))
    .orderBy(businessOwners.addedAt)
  return rows.map(toOwnerRecord)
}

export async function addBusinessOwner(
  businessId: string,
  discordUserId: string,
  addedBy: string,
): Promise<void> {
  await db
    .insert(businessOwners)
    .values({ businessId, discordUserId, addedByDiscordId: addedBy })
    .onConflictDoNothing()
}

export async function removeBusinessOwner(
  businessId: string,
  discordUserId: string,
): Promise<void> {
  await db
    .delete(businessOwners)
    .where(
      and(
        eq(businessOwners.businessId, businessId),
        eq(businessOwners.discordUserId, discordUserId),
      ),
    )
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toBusinessRecord(row: typeof businesses.$inferSelect): BusinessRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType,
    guildId: row.guildId,
    active: row.active,
    settings: (row.settings as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt ?? null,
    updatedBy: row.updatedBy ?? null,
    deactivatedAt: row.deactivatedAt ?? null,
    deactivatedBy: row.deactivatedBy ?? null,
  }
}

function toRoleMappingRecord(row: typeof businessRoleMappings.$inferSelect): RoleMappingRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    guildId: row.guildId,
    roleId: row.roleId,
    roleName: row.roleName,
    rank: row.rank,
    label: row.label,
    isBase: row.isBase,
    autoGrantEmployee: row.autoGrantEmployee,
    minRankToAssign: row.minRankToAssign,
  }
}

function toOwnerRecord(row: typeof businessOwners.$inferSelect): BusinessOwnerRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    discordUserId: row.discordUserId,
    addedByDiscordId: row.addedByDiscordId,
    addedAt: row.addedAt,
  }
}
