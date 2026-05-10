import { z } from 'zod'

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
