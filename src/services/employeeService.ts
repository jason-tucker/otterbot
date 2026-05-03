import type { Guild, GuildMember, Role } from 'discord.js'
import type { EmployeeBusinessConfig, EmployeeCustomRole } from '../config/employee-businesses.config'
import type { StaffRank } from '../types/domain'

export interface TargetEmploymentStatus {
  inBusiness: boolean
  hasEmployeeRole: boolean
  hasManagerRole: boolean
  hasOwnerRole: boolean
  /** Custom roles from the business config that the target currently holds */
  customRolesHeld: EmployeeCustomRole[]
  highestRank: StaffRank | null
}

export class RoleMissingError extends Error {
  constructor(public readonly roleName: string) {
    super(`Role not found in server: "${roleName}"`)
    this.name = 'RoleMissingError'
  }
}

export class RoleHierarchyError extends Error {
  constructor(public readonly roleName: string) {
    super(
      `Cannot manage role "${roleName}" — it is above the bot's highest role in the server hierarchy.`,
    )
    this.name = 'RoleHierarchyError'
  }
}

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Status resolution
// ---------------------------------------------------------------------------

/** Determine what roles the target currently holds in a given business. */
export function getTargetStatus(
  targetMember: GuildMember,
  config: EmployeeBusinessConfig,
): TargetEmploymentStatus {
  const hasRole = (name: string) => targetMember.roles.cache.some((r) => r.name === name)

  const hasEmployeeRole = hasRole(config.roles.employee.name)
  const hasManagerRole = hasRole(config.roles.manager.name)
  const hasOwnerRole = hasRole(config.roles.owner.name)
  const customRolesHeld = config.roles.custom.filter((c) => hasRole(c.name))

  const inBusiness =
    hasEmployeeRole || hasManagerRole || hasOwnerRole || customRolesHeld.length > 0

  let highestRank: StaffRank | null = null
  if (hasOwnerRole) highestRank = 'owner'
  else if (hasManagerRole) highestRank = 'manager'
  else if (hasEmployeeRole || customRolesHeld.length > 0) highestRank = 'employee'

  return { inBusiness, hasEmployeeRole, hasManagerRole, hasOwnerRole, customRolesHeld, highestRank }
}

// ---------------------------------------------------------------------------
// Permission checks — called before executing any action
// ---------------------------------------------------------------------------

export function canHire(commandRank: StaffRank): PermissionCheckResult {
  if (commandRank === 'employee')
    return { allowed: false, reason: 'Only managers and owners can hire employees.' }
  return { allowed: true }
}

export function canFire(
  commandRank: StaffRank,
  targetRank: StaffRank | null,
  config: EmployeeBusinessConfig,
): PermissionCheckResult {
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
  config: EmployeeBusinessConfig,
): PermissionCheckResult {
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to promote employees.' }
  if (commandRank === 'manager' && !config.permissions.managersCanPromote)
    return {
      allowed: false,
      reason: 'Managers are not authorized to promote to manager for this business.',
    }
  return { allowed: true }
}

export function canDemoteManager(
  commandRank: StaffRank,
  config: EmployeeBusinessConfig,
): PermissionCheckResult {
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to demote staff.' }
  if (commandRank === 'manager' && !config.permissions.managersCanPromote)
    return {
      allowed: false,
      reason: 'Managers are not authorized to demote other managers for this business.',
    }
  return { allowed: true }
}

export function canManageOwner(
  commandRank: StaffRank,
  config: EmployeeBusinessConfig,
): PermissionCheckResult {
  if (commandRank !== 'owner')
    return { allowed: false, reason: 'Only owners can manage owner roles.' }
  if (!config.permissions.ownersCanManageOwners)
    return { allowed: false, reason: 'Owner management is disabled for this business.' }
  return { allowed: true }
}

export function canManageCustomRole(
  commandRank: StaffRank,
  customRole: EmployeeCustomRole,
  config: EmployeeBusinessConfig,
): PermissionCheckResult {
  if (commandRank === 'employee')
    return { allowed: false, reason: 'You do not have permission to manage special roles.' }
  if (customRole.minRankToAssign === 'owner' && commandRank !== 'owner')
    return {
      allowed: false,
      reason: `Only owners can manage the "${customRole.label}" role.`,
    }
  if (customRole.minRankToAssign === 'manager' && commandRank === 'manager') {
    if (!config.permissions.managersCanAssignCustomRoles)
      return {
        allowed: false,
        reason: 'Managers are not authorized to assign special roles for this business.',
      }
  }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Role resolution helpers
// ---------------------------------------------------------------------------

function findRole(guild: Guild, roleName: string): Role {
  const role = guild.roles.cache.find((r) => r.name === roleName)
  if (!role) throw new RoleMissingError(roleName)
  return role
}

async function safeAdd(member: GuildMember, role: Role): Promise<void> {
  try {
    await member.roles.add(role)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Missing Permissions') || msg.includes('hierarchy')) {
      throw new RoleHierarchyError(role.name)
    }
    throw err
  }
}

async function safeRemove(member: GuildMember, role: Role): Promise<void> {
  try {
    await member.roles.remove(role)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Missing Permissions') || msg.includes('hierarchy')) {
      throw new RoleHierarchyError(role.name)
    }
    throw err
  }
}

async function ensureRole(member: GuildMember, role: Role): Promise<void> {
  if (!member.roles.cache.has(role.id)) await safeAdd(member, role)
}

// ---------------------------------------------------------------------------
// Role management actions
// ---------------------------------------------------------------------------

/** Hire as base employee. Assigns only the employee role. */
export async function hireEmployee(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const role = findRole(guild, config.roles.employee.name)
  await safeAdd(target, role)
}

/**
 * Remove the target from the business entirely.
 * Strips all configured roles: employee, manager, owner, and all custom roles.
 * Silently skips any configured role that doesn't exist in the server.
 */
export async function fireFromBusiness(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const roleNames = [
    config.roles.employee.name,
    config.roles.manager.name,
    config.roles.owner.name,
    ...config.roles.custom.map((c) => c.name),
  ]

  for (const name of roleNames) {
    let role: Role
    try {
      role = findRole(guild, name)
    } catch (err) {
      if (err instanceof RoleMissingError) {
        console.warn(`[employeeService] Skipping missing role during fire: "${name}"`)
        continue
      }
      throw err
    }
    if (target.roles.cache.has(role.id)) {
      await safeRemove(target, role)
    }
  }
}

/** Promote to manager. Also assigns the employee role if higherRolesAutoGrantEmployee is set. */
export async function promoteToManager(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const managerRole = findRole(guild, config.roles.manager.name)
  await safeAdd(target, managerRole)

  if (config.permissions.higherRolesAutoGrantEmployee) {
    const employeeRole = findRole(guild, config.roles.employee.name)
    await ensureRole(target, employeeRole)
  }
}

/** Demote from manager to employee. Removes manager role, ensures employee role is present. */
export async function demoteToEmployee(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const managerRole = findRole(guild, config.roles.manager.name)
  if (target.roles.cache.has(managerRole.id)) {
    await safeRemove(target, managerRole)
  }

  const employeeRole = findRole(guild, config.roles.employee.name)
  await ensureRole(target, employeeRole)
}

/** Promote to owner. Also assigns the employee role if higherRolesAutoGrantEmployee is set. */
export async function promoteToOwner(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const ownerRole = findRole(guild, config.roles.owner.name)
  await safeAdd(target, ownerRole)

  if (config.permissions.higherRolesAutoGrantEmployee) {
    const employeeRole = findRole(guild, config.roles.employee.name)
    await ensureRole(target, employeeRole)
  }
}

/** Demote owner to manager. Removes owner role, ensures manager and employee roles are present. */
export async function demoteOwnerToManager(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const ownerRole = findRole(guild, config.roles.owner.name)
  if (target.roles.cache.has(ownerRole.id)) {
    await safeRemove(target, ownerRole)
  }

  const managerRole = findRole(guild, config.roles.manager.name)
  await ensureRole(target, managerRole)

  if (config.permissions.higherRolesAutoGrantEmployee) {
    const employeeRole = findRole(guild, config.roles.employee.name)
    await ensureRole(target, employeeRole)
  }
}

/** Demote owner directly to employee. Removes owner and manager roles, ensures employee role. */
export async function demoteOwnerToEmployee(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
): Promise<void> {
  const ownerRole = findRole(guild, config.roles.owner.name)
  if (target.roles.cache.has(ownerRole.id)) {
    await safeRemove(target, ownerRole)
  }

  const managerRole = findRole(guild, config.roles.manager.name)
  if (target.roles.cache.has(managerRole.id)) {
    await safeRemove(target, managerRole)
  }

  const employeeRole = findRole(guild, config.roles.employee.name)
  await ensureRole(target, employeeRole)
}

/**
 * Assign a custom role (e.g. MKE Assistant, Printing Press Operator).
 * Also assigns the base employee role if autoGrantEmployee is set.
 */
export async function assignCustomRole(
  guild: Guild,
  target: GuildMember,
  config: EmployeeBusinessConfig,
  customRole: EmployeeCustomRole,
): Promise<void> {
  const role = findRole(guild, customRole.name)
  await safeAdd(target, role)

  if (customRole.autoGrantEmployee) {
    const employeeRole = findRole(guild, config.roles.employee.name)
    await ensureRole(target, employeeRole)
  }
}

/** Remove a custom role. Does not touch the base employee role. */
export async function removeCustomRole(
  guild: Guild,
  target: GuildMember,
  _config: EmployeeBusinessConfig,
  customRole: EmployeeCustomRole,
): Promise<void> {
  const role = findRole(guild, customRole.name)
  if (target.roles.cache.has(role.id)) {
    await safeRemove(target, role)
  }
}
