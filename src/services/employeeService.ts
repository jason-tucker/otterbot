import { eq, and } from 'drizzle-orm'
import type { Guild, GuildMember, Role } from 'discord.js'
import { db } from '../db/client'
import { businesses, businessRoleMappings } from '../db/schema'
import type { StaffRank } from '../types/domain'

// ---------------------------------------------------------------------------
// DB-backed business config — replaces the static employee-businesses.config.ts
// at runtime. Built from the database on every use.
// ---------------------------------------------------------------------------

export interface DbRoleEntry {
  mappingId: string
  roleId: string
  roleName: string
  label: string
}

export interface DbCustomRole extends DbRoleEntry {
  autoGrantEmployee: boolean
  minRankToAssign: 'manager' | 'owner'
}

export interface DbEmployeeBusinessConfig {
  businessId: string
  slug: string
  name: string
  providerType: 'mckenzie' | 'discord-only'
  roles: {
    employee: DbRoleEntry | null
    manager: DbRoleEntry | null
    owner: DbRoleEntry | null
    custom: DbCustomRole[]
  }
  permissions: {
    managersCanPromote: boolean
    managersCanAssignCustomRoles: boolean
    ownersCanManageOwners: boolean
    higherRolesAutoGrantEmployee: boolean
    allowOwnerRoleFallback: boolean
  }
}

function toRoleEntry(row: {
  id: string
  roleId: string
  roleName: string | null
  label: string | null
}): DbRoleEntry {
  return {
    mappingId: row.id,
    roleId: row.roleId,
    roleName: row.roleName ?? row.roleId,
    label: row.label ?? row.roleName ?? row.roleId,
  }
}

function toCustomRole(row: {
  id: string
  roleId: string
  roleName: string | null
  label: string | null
  autoGrantEmployee: boolean
  minRankToAssign: string
}): DbCustomRole {
  return {
    mappingId: row.id,
    roleId: row.roleId,
    roleName: row.roleName ?? row.roleId,
    label: row.label ?? row.roleName ?? row.roleId,
    autoGrantEmployee: row.autoGrantEmployee,
    minRankToAssign: (row.minRankToAssign === 'owner' ? 'owner' : 'manager') as 'manager' | 'owner',
  }
}

/**
 * Load business config from the database. Returns null if the business doesn't
 * exist or is inactive.
 */
export async function getEmployeeBusinessConfig(
  businessId: string,
  guildId: string,
): Promise<DbEmployeeBusinessConfig | null> {
  const bizRows = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.active, true)))
    .limit(1)

  if (!bizRows.length) return null
  const biz = bizRows[0]

  const mappings = await db
    .select()
    .from(businessRoleMappings)
    .where(
      and(
        eq(businessRoleMappings.businessId, businessId),
        eq(businessRoleMappings.guildId, guildId),
      ),
    )

  const s = (biz.settings ?? {}) as Record<string, unknown>

  // Base employee: isBase=true employee-rank row, or first employee-rank row as fallback
  const empMappings = mappings.filter((m) => m.rank === 'employee')
  const baseEmp = empMappings.find((m) => m.isBase) ?? empMappings[0] ?? null
  const managerRow = mappings.find((m) => m.rank === 'manager') ?? null
  const ownerRow = mappings.find((m) => m.rank === 'owner') ?? null
  // Custom roles: employee-rank rows that are NOT the base
  const customRows = empMappings.filter((m) => m.id !== baseEmp?.id)

  return {
    businessId: biz.id,
    slug: biz.slug,
    name: biz.name,
    providerType: biz.providerType,
    roles: {
      employee: baseEmp ? toRoleEntry(baseEmp) : null,
      manager: managerRow ? toRoleEntry(managerRow) : null,
      owner: ownerRow ? toRoleEntry(ownerRow) : null,
      custom: customRows.map(toCustomRole),
    },
    permissions: {
      managersCanPromote: Boolean(s.managersCanPromote ?? false),
      managersCanAssignCustomRoles: Boolean(s.managersCanAssignCustomRoles ?? true),
      ownersCanManageOwners: Boolean(s.ownersCanManageOwners ?? true),
      higherRolesAutoGrantEmployee: Boolean(s.higherRolesAutoGrantEmployee ?? true),
      allowOwnerRoleFallback: Boolean(s.allowOwnerRoleFallback ?? false),
    },
  }
}

// ---------------------------------------------------------------------------
// Employment status
// ---------------------------------------------------------------------------

export interface TargetEmploymentStatus {
  inBusiness: boolean
  hasEmployeeRole: boolean
  hasManagerRole: boolean
  /** Effective owner status — true if DB owner OR (allowOwnerRoleFallback && has Discord owner role) */
  isOwner: boolean
  /** True only when the user has an explicit record in the business_owners table */
  isDbOwner: boolean
  /** Raw Discord role presence, regardless of DB ownership */
  hasOwnerDiscordRole: boolean
  customRolesHeld: DbCustomRole[]
  highestRank: StaffRank | null
}

/**
 * Determine the target's current employment status in a business.
 * isDbOwner should be pre-fetched from the business_owners table via isBusinessOwner().
 */
export function getTargetStatus(
  targetMember: GuildMember,
  config: DbEmployeeBusinessConfig,
  isDbOwner: boolean,
): TargetEmploymentStatus {
  const hasRoleId = (roleId: string | undefined) =>
    !!roleId && targetMember.roles.cache.has(roleId)

  const hasEmployeeRole = hasRoleId(config.roles.employee?.roleId)
  const hasManagerRole = hasRoleId(config.roles.manager?.roleId)
  const hasOwnerDiscordRole = hasRoleId(config.roles.owner?.roleId)

  const isOwner = isDbOwner || (config.permissions.allowOwnerRoleFallback && hasOwnerDiscordRole)

  const customRolesHeld = config.roles.custom.filter((cr) => hasRoleId(cr.roleId))
  const inBusiness = hasEmployeeRole || hasManagerRole || isOwner || customRolesHeld.length > 0

  let highestRank: StaffRank | null = null
  if (isOwner) highestRank = 'owner'
  else if (hasManagerRole) highestRank = 'manager'
  else if (hasEmployeeRole || customRolesHeld.length > 0) highestRank = 'employee'

  return {
    inBusiness,
    hasEmployeeRole,
    hasManagerRole,
    isOwner,
    isDbOwner,
    hasOwnerDiscordRole,
    customRolesHeld,
    highestRank,
  }
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

export function canHire(commandRank: StaffRank, isSudo: boolean): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank === 'employee')
    return { allowed: false, reason: 'Only managers and owners can hire employees.' }
  return { allowed: true }
}

export function canFire(
  commandRank: StaffRank,
  targetRank: StaffRank | null,
  config: DbEmployeeBusinessConfig,
  isSudo: boolean,
): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to remove employees.' }
  if (targetRank === 'owner') {
    if (commandRank !== 'owner')
      return { allowed: false, reason: 'Only owners can remove other owners from the business.' }
    if (!config.permissions.ownersCanManageOwners)
      return { allowed: false, reason: 'Owner management is disabled for this business.' }
  }
  if (targetRank === 'manager' && commandRank !== 'owner')
    return { allowed: false, reason: 'Only owners can remove managers from the business.' }
  return { allowed: true }
}

export function canPromoteToManager(
  commandRank: StaffRank,
  config: DbEmployeeBusinessConfig,
  isSudo: boolean,
): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to promote employees.' }
  if (commandRank === 'manager' && !config.permissions.managersCanPromote)
    return { allowed: false, reason: 'Managers cannot promote to manager for this business.' }
  return { allowed: true }
}

export function canDemoteManager(
  commandRank: StaffRank,
  config: DbEmployeeBusinessConfig,
  isSudo: boolean,
): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to demote staff.' }
  if (commandRank === 'manager' && !config.permissions.managersCanPromote)
    return { allowed: false, reason: 'Managers cannot demote other managers for this business.' }
  return { allowed: true }
}

export function canManageOwner(
  commandRank: StaffRank,
  config: DbEmployeeBusinessConfig,
  isSudo: boolean,
): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank !== 'owner')
    return { allowed: false, reason: 'Only owners can manage owner roles.' }
  if (!config.permissions.ownersCanManageOwners)
    return { allowed: false, reason: 'Owner management is disabled for this business.' }
  return { allowed: true }
}

export function canManageCustomRole(
  commandRank: StaffRank,
  customRole: DbCustomRole,
  config: DbEmployeeBusinessConfig,
  isSudo: boolean,
): PermissionCheckResult {
  if (isSudo) return { allowed: true }
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to manage special roles.' }
  if (customRole.minRankToAssign === 'owner' && commandRank !== 'owner')
    return { allowed: false, reason: `Only owners can manage the "${customRole.label}" role.` }
  if (customRole.minRankToAssign === 'manager' && commandRank === 'manager') {
    if (!config.permissions.managersCanAssignCustomRoles)
      return { allowed: false, reason: 'Managers cannot assign special roles for this business.' }
  }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class RoleMissingError extends Error {
  constructor(public readonly roleName: string) {
    super(`Role not found in server: "${roleName}"`)
    this.name = 'RoleMissingError'
  }
}

export class RoleHierarchyError extends Error {
  constructor(public readonly roleName: string) {
    super(`Cannot manage role "${roleName}" — it is above the bot's highest role.`)
    this.name = 'RoleHierarchyError'
  }
}

// ---------------------------------------------------------------------------
// Role resolution helpers
// ---------------------------------------------------------------------------

function findRole(guild: Guild, entry: DbRoleEntry): Role {
  // Try by ID first (fast, reliable)
  const byId = guild.roles.cache.get(entry.roleId)
  if (byId) return byId
  // Fallback to name if the ID is stale
  const byName = guild.roles.cache.find((r) => r.name === entry.roleName)
  if (byName) return byName
  throw new RoleMissingError(entry.roleName)
}

async function safeAdd(member: GuildMember, role: Role): Promise<void> {
  try {
    await member.roles.add(role)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Missing Permissions') || msg.includes('hierarchy'))
      throw new RoleHierarchyError(role.name)
    throw err
  }
}

async function safeRemove(member: GuildMember, role: Role): Promise<void> {
  try {
    await member.roles.remove(role)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Missing Permissions') || msg.includes('hierarchy'))
      throw new RoleHierarchyError(role.name)
    throw err
  }
}

async function ensureRole(member: GuildMember, role: Role): Promise<void> {
  if (!member.roles.cache.has(role.id)) await safeAdd(member, role)
}

// ---------------------------------------------------------------------------
// Role management actions
// ---------------------------------------------------------------------------

export async function hireEmployee(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.employee) throw new RoleMissingError('(no employee role configured)')
  const role = findRole(guild, config.roles.employee)
  await safeAdd(target, role)
}

export async function fireFromBusiness(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  const allEntries = [
    config.roles.employee,
    config.roles.manager,
    config.roles.owner,
    ...config.roles.custom,
  ].filter((e): e is DbRoleEntry => e !== null)

  for (const entry of allEntries) {
    let role: Role
    try {
      role = findRole(guild, entry)
    } catch (err) {
      if (err instanceof RoleMissingError) {
        console.warn(`[employeeService] Skipping missing role during fire: "${entry.roleName}"`)
        continue
      }
      throw err
    }
    if (target.roles.cache.has(role.id)) await safeRemove(target, role)
  }
}

export async function promoteToManager(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.manager) throw new RoleMissingError('(no manager role configured)')
  const managerRole = findRole(guild, config.roles.manager)
  await safeAdd(target, managerRole)
  if (config.permissions.higherRolesAutoGrantEmployee && config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function demoteToEmployee(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.manager) throw new RoleMissingError('(no manager role configured)')
  const managerRole = findRole(guild, config.roles.manager)
  if (target.roles.cache.has(managerRole.id)) await safeRemove(target, managerRole)
  if (config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function promoteToOwner(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.owner) throw new RoleMissingError('(no owner role configured)')
  const ownerRole = findRole(guild, config.roles.owner)
  await safeAdd(target, ownerRole)
  if (config.permissions.higherRolesAutoGrantEmployee && config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function demoteOwnerToManager(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.owner) throw new RoleMissingError('(no owner role configured)')
  const ownerRole = findRole(guild, config.roles.owner)
  if (target.roles.cache.has(ownerRole.id)) await safeRemove(target, ownerRole)
  if (config.roles.manager) {
    const managerRole = findRole(guild, config.roles.manager)
    await ensureRole(target, managerRole)
  }
  if (config.permissions.higherRolesAutoGrantEmployee && config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function demoteOwnerToEmployee(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
): Promise<void> {
  if (!config.roles.owner) throw new RoleMissingError('(no owner role configured)')
  const ownerRole = findRole(guild, config.roles.owner)
  if (target.roles.cache.has(ownerRole.id)) await safeRemove(target, ownerRole)
  if (config.roles.manager) {
    const managerRole = findRole(guild, config.roles.manager)
    if (target.roles.cache.has(managerRole.id)) await safeRemove(target, managerRole)
  }
  if (config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function assignCustomRole(
  guild: Guild,
  target: GuildMember,
  config: DbEmployeeBusinessConfig,
  customRole: DbCustomRole,
): Promise<void> {
  const role = findRole(guild, customRole)
  await safeAdd(target, role)
  if (customRole.autoGrantEmployee && config.roles.employee) {
    const empRole = findRole(guild, config.roles.employee)
    await ensureRole(target, empRole)
  }
}

export async function removeCustomRole(
  guild: Guild,
  target: GuildMember,
  customRole: DbCustomRole,
): Promise<void> {
  const role = findRole(guild, customRole)
  if (target.roles.cache.has(role.id)) await safeRemove(target, role)
}
