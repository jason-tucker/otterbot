import type { GuildMember } from 'discord.js'
import { env } from '../config/env'

/**
 * Returns true if the member holds any of the configured sudo role IDs.
 * Sudo users bypass all business permission limits and can access /portal.
 */
export function isSudoUser(member: GuildMember): boolean {
  if (env.sudoRoleIds.length === 0) return false
  return env.sudoRoleIds.some((id) => member.roles.cache.has(id))
}
