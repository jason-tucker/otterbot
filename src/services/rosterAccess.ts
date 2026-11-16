import type { ResolvedBusiness } from '../types/domain'

/**
 * Pick the business (and rank) a staff member views a searched roster under.
 * Roster characters carry MKE customer PII, so only these viewers qualify:
 * - staff of the searched business (matched by `apiBusinessName` or name,
 *   trimmed + lowercased) keep their rank for it;
 * - McKenzie staff (a resolved business with providerType 'mckenzie') view
 *   under that business with their own rank.
 * Everyone else gets null. Sudo is handled by the caller.
 */
export function pickRosterViewer(
  all: ResolvedBusiness[],
  rosterName: string,
): ResolvedBusiness | null {
  const wanted = rosterName.trim().toLowerCase()
  const matched = all.find((r) => {
    const apiName = ((r.business.settings?.apiBusinessName as string | undefined) ?? r.business.name)
      .trim()
      .toLowerCase()
    return apiName === wanted || r.business.name.trim().toLowerCase() === wanted
  })
  if (matched) return matched
  return all.find((r) => r.business.providerType === 'mckenzie') ?? null
}

/**
 * True when the viewer may see roster contact details (CSN, phone, bank) and
 * use Lookup Employee / Send to Channel: sudo, staff of the searched business,
 * or McKenzie staff. Everyone else gets the names-only roster card.
 */
export function hasRosterDetailAccess(
  all: ResolvedBusiness[],
  rosterName: string,
  sudo: boolean,
): boolean {
  return sudo || pickRosterViewer(all, rosterName) !== null
}

/** Discord select menus allow at most 25 options. */
export const MAX_SELECT_OPTIONS = 25

/** Truncate to Discord's 100-char label/description limit. */
export function clip100(text: string): string {
  return text.length > 100 ? text.slice(0, 99) + '…' : text
}

/**
 * Per-user rate limit shared by `/business` and the Search Business modal
 * (one map, so the modal cannot be used to bypass the slash-command cooldown).
 */
export const BUSINESS_COOLDOWN_MS = 30_000
const lastBusinessSearchAt = new Map<string, number>()

/**
 * Returns remaining cooldown seconds (> 0 means "blocked"), or 0 after
 * recording this attempt. Sudo callers should skip this entirely.
 */
export function checkBusinessCooldown(userId: string, now: number = Date.now()): number {
  const last = lastBusinessSearchAt.get(userId) ?? 0
  const remaining = BUSINESS_COOLDOWN_MS - (now - last)
  if (remaining > 0) return Math.ceil(remaining / 1000)
  if (lastBusinessSearchAt.size > 500) {
    const cutoff = now - BUSINESS_COOLDOWN_MS
    for (const [k, t] of lastBusinessSearchAt) if (t < cutoff) lastBusinessSearchAt.delete(k)
  }
  lastBusinessSearchAt.set(userId, now)
  return 0
}

export function resetBusinessCooldownsForTest(): void {
  lastBusinessSearchAt.clear()
}
