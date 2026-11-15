import { z } from 'zod'
import { PermissionFlagsBits } from 'discord.js'

/**
 * Zod-based validators and `safeParse` helpers used to harden user-supplied
 * input before it touches Discord APIs or the database.
 *
 * Each schema is paired with a `parseX(input): T | null` helper that returns
 * `null` on validation failure, making call sites a one-liner without
 * try/catch noise.
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/**
 * Discord snowflake ID — 17-20 numeric digits.
 * Discord IDs are 64-bit unsigned ints encoded as decimal strings.
 */
export const snowflake = z.string().regex(/^\d{17,20}$/)

/**
 * URL-safe slug — lowercase, must start with a letter, may contain digits and
 * hyphens, max 50 characters.
 */
export const slug = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/)

/**
 * Business display name — trimmed string, 1-100 chars.
 */
export const businessName = z.string().trim().min(1).max(100)

/**
 * Staff rank enum — keep in sync with `StaffRank` in `src/types/domain.ts`.
 */
export const rank = z.enum(['employee', 'manager', 'owner'])
export type Rank = z.infer<typeof rank>

/**
 * HTTP(S) URL — trimmed, ≤512 chars, must be http or https. Used for
 * manager-supplied link-button URLs so a `javascript:` / `data:` URI can't
 * sneak onto a public command embed.
 */
export const httpUrl = z
  .string()
  .trim()
  .max(512)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'must be http(s)' })

// -----------------------------------------------------------------------------
// safeParse helpers — return parsed value on success, `null` on failure
// -----------------------------------------------------------------------------

export function parseSnowflake(input: unknown): string | null {
  const result = snowflake.safeParse(input)
  return result.success ? result.data : null
}

export function parseSlug(input: unknown): string | null {
  const result = slug.safeParse(input)
  return result.success ? result.data : null
}

export function parseBusinessName(input: unknown): string | null {
  const result = businessName.safeParse(input)
  return result.success ? result.data : null
}

export function parseRank(input: unknown): Rank | null {
  const result = rank.safeParse(input)
  return result.success ? result.data : null
}

export function parseHttpUrl(input: unknown): string | null {
  const result = httpUrl.safeParse(input)
  return result.success ? result.data : null
}

// -----------------------------------------------------------------------------
// Portal helpers
// -----------------------------------------------------------------------------

/** Slugs other code hard-codes (caked.ts, businessMessagesService, RPC business verbs). */
export const PROTECTED_BUSINESS_SLUGS: readonly string[] = ['original-clothing', 'caked-up', 'mckenzie']

/**
 * Permissions a business-rank role must not carry (mapped roles are grantable
 * by managers). ManageChannels is included because the bot treats it as access
 * to ticket PII (ticketCharSelect, ticketAccountMade).
 */
export const DANGEROUS_ROLE_PERMISSIONS: readonly bigint[] = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
]

export interface MappableRoleInfo {
  managed?: boolean
  position?: number
  permissions?: { has(permission: bigint): boolean }
}

/**
 * Returns an error message when a role must not be mapped to a business rank,
 * or null when it is fine. Refused: @everyone (role id == guild id), a role
 * that could not be fetched, managed roles, roles at or above the bot's
 * highest role, and roles with any DANGEROUS_ROLE_PERMISSIONS flag.
 * `botTopPosition` is the bot's highest role position; pass null when it
 * could not be determined and the mapping is refused (fail closed).
 */
export function checkMappableRole(
  roleId: string,
  guildId: string,
  role: MappableRoleInfo | null,
  botTopPosition: number | null,
): string | null {
  if (roleId === guildId) return '@everyone cannot be mapped to a business rank.'
  if (!role) return 'That role could not be found in this server.'
  if (role.managed) return 'Managed (bot/integration) roles cannot be mapped to a business rank.'
  if (botTopPosition === null || role.position === undefined) {
    return 'Could not verify the role position against the bot highest role. Try again.'
  }
  if (role.position >= botTopPosition) {
    return 'That role is at or above the bot highest role.'
  }
  const perms = role.permissions
  if (!perms) return 'Could not read that role permissions. Try again.'
  if (DANGEROUS_ROLE_PERMISSIONS.some((p) => perms.has(p))) {
    return 'Roles with moderation or server-management permissions (for example Administrator, Manage Roles, Manage Channels, Manage Webhooks, Ban or Kick) cannot be mapped to a business rank.'
  }
  return null
}

/**
 * True when an error is a unique violation. drizzle wraps driver errors in a
 * DrizzleQueryError, so the Postgres code (23505) and message live on `cause`.
 */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err
  for (let depth = 0; depth < 4 && cur != null; depth++) {
    if (typeof cur === 'string') return /unique|duplicate|already exists/i.test(cur)
    const e = cur as { code?: unknown; message?: unknown; cause?: unknown }
    if (e.code === '23505') return true
    // The top-level DrizzleQueryError message embeds the query params, so a
    // user-supplied value (e.g. a name containing "already exists") must not
    // match there. A wrapper's message is never trusted; an unwrapped
    // top-level error only matches the driver phrases; causes match all.
    if (typeof e.message === 'string') {
      const wrapped = depth === 0 && e.cause != null
      const pattern = depth === 0 ? /unique constraint|duplicate key/i : /unique constraint|duplicate key|already exists/i
      if (!wrapped && pattern.test(e.message)) return true
    }
    cur = e.cause
  }
  return false
}
