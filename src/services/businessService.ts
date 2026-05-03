import type { Business } from '../types/domain'
import type { IBusinessProvider } from './providers/IBusinessProvider'
import { MckenzieProvider } from './providers/MckenzieProvider'
import { DiscordOnlyProvider } from './providers/DiscordOnlyProvider'

export function getProvider(business: Business): IBusinessProvider {
  switch (business.providerType) {
    case 'mckenzie':
      return new MckenzieProvider(business)
    case 'discord-only':
      return new DiscordOnlyProvider(business)
  }
}
