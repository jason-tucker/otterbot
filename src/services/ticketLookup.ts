/**
 * Shared helpers for the auto-ticket flow.
 *
 * `fetchCharacters` and `getMckenzieBusinessId` were previously copy-pasted
 * (verbatim) in `bot/events/ticketChannelCreate.ts` AND
 * `interactions/buttons/ticketAccountMade.ts`. Both call paths run the same
 * MKE lookup against the Euphoric API (8 s timeout) and the same DB
 * single-row query for the local McKenzie business id, so they share one
 * implementation here.
 */
import { and, eq } from 'drizzle-orm'
import { env } from '../config/env'
import { db } from '../db/client'
import { businesses } from '../db/schema'

/** Hard-coded constants used by the ticket auto-lookup. The category is the
 *  Ticket Tool integration's parent category in this guild; the bot user id
 *  is Ticket Tool's. Both belong to a third-party setup we don't control. */
export const TICKET_CATEGORY_ID = '1101739267908177991'
export const TICKET_BOT_USER_ID = '722196398635745312'

/** Euphoric / McKenzie character profile shape returned by the public API. */
export interface MkCharacterProfile {
  id: string
  status: boolean
  name: string
  csn: string
  dob: string | null
  phoneNumber: string
  bankNumber: string
}

/** What the ticket flow actually consumes — a slim subset of the API row. */
export interface TicketCharacter {
  id: string
  name: string
  csn: string | null
  phoneNumber: string | null
  bankNumber: string | null
}

/**
 * GET /character-profiles/discord/{discordId} — returns the MKE characters
 * linked to a Discord account, filtered to active (`status === true`) only.
 * Returns an empty array on any non-2xx response or invalid payload; throws
 * only when fetch itself rejects (network / timeout).
 */
export async function fetchCharacters(discordId: string): Promise<TicketCharacter[]> {
  const res = await fetch(
    `${env.EUPHORIC_API_BASE_URL}/character-profiles/discord/${encodeURIComponent(discordId)}`,
    { headers: { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }, signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) return []
  const data = await res.json() as MkCharacterProfile[]
  if (!Array.isArray(data)) return []
  return data
    .filter(p => p.status)
    .map(p => ({
      id: p.id,
      name: p.name,
      csn: p.csn || null,
      phoneNumber: p.phoneNumber || null,
      bankNumber: p.bankNumber || null,
    }))
}

/** The single active McKenzie-provider business row for a given guild. */
export async function getMckenzieBusinessId(guildId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(
      eq(businesses.providerType, 'mckenzie'),
      eq(businesses.guildId, guildId),
      eq(businesses.active, true),
    ))
    .limit(1)
  return row?.id ?? null
}
