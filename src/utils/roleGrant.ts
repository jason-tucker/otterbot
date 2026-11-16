import type { Guild } from 'discord.js'
import { checkGrantableRole, type MappableRoleInfo } from './validators'
import { createLogger } from './logger'

const logger = createLogger('roleGrant')

/**
 * Grant-time re-check of a role against the LIVE guild. `/portal` only runs
 * `checkMappableRole` when a mapping is added; a role's permissions or position
 * can change afterwards (or a mapping can pre-date the check), so every
 * `roles.add` re-validates. Returns a refusal reason, or null when the role may
 * be granted. Fails closed: an unreadable role or bot position refuses.
 * Refused: @everyone, managed roles, roles at or above the bot's top role, and
 * roles with an escalation permission (Administrator, Manage Roles, Manage Server,
 * Manage Webhooks, Ban Members). Ordinary moderation bits are allowed here.
 */
export async function grantRoleProblem(guild: Guild, roleId: string): Promise<string | null> {
  let live: MappableRoleInfo | null = null
  try {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId))
    if (role) live = { managed: role.managed, position: role.position, permissions: role.permissions }
  } catch {
    live = null
  }
  let botTop: number | null = null
  try {
    botTop = (guild.members.me ?? (await guild.members.fetchMe())).roles.highest.position
  } catch {
    botTop = null
  }
  const problem = checkGrantableRole(roleId, guild.id, live, botTop)
  if (problem) logger.warn('refused role grant', { guildId: guild.id, roleId, reason: problem })
  return problem
}
