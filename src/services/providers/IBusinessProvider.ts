import type { Character } from '../../types/domain'

export interface RosterMember {
  id: string
  name: string
  csn: string | null
  role: 'owner' | 'employee'
  discordId: string | null
  character: Character
}

export interface BusinessRoster {
  businessName: string
  ownerName: string | null
  members: RosterMember[]
}

export interface ApiNote {
  id: string
  created: string
  profileId: string
  /**
   * Marker type from MKE API. Per the website, only these are user-visible "notes":
   *   0 = Note            (neutral observation)
   *   1 = Good Experience (positive)
   *   2 = Bad Experience  (negative)
   * Other types (warning/ban/standing) come through the same endpoint but should
   * be filtered out for /lookup since the website's Standing is computed from
   * profile.securityRiskLevel, not derived from these markers.
   */
  type: number
  content: string
  employeeId: number
  status?: boolean
  editHistory?: unknown[]
}

export const MARKER_TYPE_NOTE = 0
export const MARKER_TYPE_GOOD = 1
export const MARKER_TYPE_BAD = 2
export const VISIBLE_MARKER_TYPES = [MARKER_TYPE_NOTE, MARKER_TYPE_GOOD, MARKER_TYPE_BAD] as const

export function markerTypeLabel(type: number): string {
  if (type === MARKER_TYPE_NOTE) return 'Note'
  if (type === MARKER_TYPE_GOOD) return 'Good Experience'
  if (type === MARKER_TYPE_BAD) return 'Bad Experience'
  return `Type ${type}`
}

export function markerTypeEmoji(type: number): string {
  if (type === MARKER_TYPE_NOTE) return '📝'
  if (type === MARKER_TYPE_GOOD) return '✅'
  if (type === MARKER_TYPE_BAD) return '❌'
  return '❓'
}

export interface IBusinessProvider {
  lookupByDiscordId(discordId: string): Promise<Character[]>
  lookupByName(name: string): Promise<Character[]>
  getBusinessRoster(): Promise<BusinessRoster | null>
  /** Fetch markers (notes/warnings/standings) by CSN. */
  getNotes?(csn: string): Promise<ApiNote[]>
}
