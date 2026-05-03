import type { Guild } from 'discord.js'

// guildId → (commandName → commandId)
const cache = new Map<string, Map<string, string>>()

export async function loadGuildCommandIds(guild: Guild): Promise<void> {
  try {
    const commands = await guild.commands.fetch()
    const guildMap = new Map<string, string>()
    for (const [, c] of commands) {
      guildMap.set(c.name, c.id)
    }
    cache.set(guild.id, guildMap)
  } catch (err) {
    console.warn(`[cmdMention] Could not load command IDs for guild ${guild.id}:`, err)
  }
}

/** Returns a clickable Discord slash command mention, e.g. </lookup:1234567890> */
export function cmd(name: string, guildId: string): string {
  const id = cache.get(guildId)?.get(name)
  return id ? `</${name}:${id}>` : `\`/${name}\``
}
