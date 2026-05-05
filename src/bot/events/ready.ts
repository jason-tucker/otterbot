import type { Client } from 'discord.js'
import { loadGuildCommandIds } from '../../utils/cmdMention'
import { startHealthPush } from '../healthPush'
import { initPresence } from '../../services/presence'
import { env } from '../../config/env'

export function registerReadyEvent(client: Client) {
  client.once('clientReady', async (c) => {
    console.log(`Logged in as ${c.user.tag}`)
    initPresence(c)
    for (const [, guild] of c.guilds.cache) {
      await loadGuildCommandIds(guild)
    }
    startHealthPush()

    // DM the owner on startup
    if (env.BOT_OWNER_ID) {
      const owner = await c.users.fetch(env.BOT_OWNER_ID).catch(() => null)
      if (owner) {
        const guilds = [...c.guilds.cache.values()].map(g => `${g.name} (${g.id})`).join(', ')
        await owner.send(`🟢 **Otterbot started**\nLogged in as **${c.user.tag}**\nGuilds: ${guilds}`).catch(() => {})
      }
    }
  })
}
