import type { Character, Business } from '../../types/domain'
import type { IBusinessProvider, BusinessRoster } from './IBusinessProvider'

export class DiscordOnlyProvider implements IBusinessProvider {
  constructor(private readonly business: Business) {}

  async lookupByDiscordId(_discordId: string): Promise<Character[]> {
    return []
  }

  async lookupByName(_name: string): Promise<Character[]> {
    return []
  }

  async getBusinessRoster(): Promise<BusinessRoster | null> {
    // Discord-only businesses don't have an external roster yet
    return {
      businessName: this.business.name,
      ownerName: null,
      members: [],
    }
  }
}
