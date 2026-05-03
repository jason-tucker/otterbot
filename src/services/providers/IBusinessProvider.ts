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

export interface IBusinessProvider {
  lookupByDiscordId(discordId: string): Promise<Character[]>
  lookupByName(name: string): Promise<Character[]>
  getBusinessRoster(): Promise<BusinessRoster | null>
}
