import type { Guild } from 'discord.js'
import { resolveBusinesses } from './permissionService'
import { isSudoUser } from './sudoService'
import { hasRosterDetailAccess } from './rosterAccess'
import type { SendAuthorizer } from '../utils/sendable'

/**
 * Re-resolves, from the live guild member, whether a user may see roster
 * contact details for `rosterName`. Used on every roster button click.
 */
export async function canSeeRosterDetails(guild: Guild, userId: string, rosterName: string): Promise<boolean> {
  const member = await guild.members.fetch(userId)
  if (isSudoUser(member)) return true
  return hasRosterDetailAccess(await resolveBusinesses(member), rosterName, false)
}

/**
 * Send to Channel guard for a full roster card: only the searching user, and
 * only while they still have roster detail access.
 */
export function rosterSendAuthorizer(actorDiscordId: string, rosterName: string): SendAuthorizer {
  return async (interaction) => {
    if (!interaction.guild || interaction.user.id !== actorDiscordId) return false
    return canSeeRosterDetails(interaction.guild, interaction.user.id, rosterName)
  }
}
