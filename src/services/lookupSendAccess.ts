import { resolveBusinesses } from './permissionService'
import { isSudoUser } from './sudoService'
import type { SendAuthorizer } from '../utils/sendable'

/**
 * Send to Channel guard for a customer (`/lookup`) card. The card carries CSN,
 * DOB, phone and bank, so the click is re-checked live: only the user who ran
 * the lookup, and only while they are still McKenzie staff or sudo (the same
 * rule that granted the view). Not used for 'self' lookups, which show the
 * viewer their own character.
 */
export function lookupSendAuthorizer(actorDiscordId: string): SendAuthorizer {
  return async (interaction) => {
    if (!interaction.guild || interaction.user.id !== actorDiscordId) return false
    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (isSudoUser(member)) return true
    const resolved = await resolveBusinesses(member)
    return resolved.some((r) => r.business.providerType === 'mckenzie')
  }
}
