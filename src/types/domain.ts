export type BusinessProviderType = 'mckenzie' | 'discord-only'
export type StaffRank = 'employee' | 'manager' | 'owner'
export type Standing = 'good' | 'neutral' | 'bad' | 'blacklisted'
export type NoteVisibility = 'staff' | 'manager' | 'owner'

export interface Business {
  id: string
  name: string
  slug: string
  providerType: BusinessProviderType
  guildId: string
  active: boolean
  settings: Record<string, unknown> | null
  createdAt: Date
}

export interface BusinessRoleMapping {
  id: string
  businessId: string
  guildId: string
  roleId: string
  rank: StaffRank
}

export interface Character {
  id: string
  name: string
  csn: string | null
  dob: string | null
  phoneNumber: string | null
  bankNumber: string | null
  discordId: string | null
  securityRiskLevel: number
  securityRiskInfo: { till: string | null; reason: string | null } | null
  source: 'mckenzie_api' | 'local'
}

export interface CustomerNote {
  id: string
  businessId: string
  characterId: string
  characterName: string
  content: string
  authorDiscordId: string
  authorName: string
  visibility: NoteVisibility
  createdAt: Date
}

export interface CustomerStanding {
  id: string
  businessId: string
  characterId: string
  characterName: string
  standing: Standing
  reason: string | null
  updatedByDiscordId: string
  updatedAt: Date
}

export interface ResolvedBusiness {
  business: Business
  rank: StaffRank
}

export const RANK_ORDER: Record<StaffRank, number> = {
  owner: 3,
  manager: 2,
  employee: 1,
}

export const STANDING_COLORS: Record<Standing, number> = {
  good: 0x57f287,
  neutral: 0x95a5a6,
  bad: 0xe67e22,
  blacklisted: 0xed4245,
}
