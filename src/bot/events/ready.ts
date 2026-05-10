import type { Client } from 'discord.js'
import { loadGuildCommandIds } from '../../utils/cmdMention'
import { startHealthPush } from '../healthPush'
import { initPresence, refreshPresence } from '../../services/presence'
import { env } from '../../config/env'

export function registerReadyEvent(client: Client) {
  client.once('clientReady', async (c) => {
    console.log(`Logged in as ${c.user.tag}`)
    initPresence(c)
    for (const [, guild] of c.guilds.cache) {
      await loadGuildCommandIds(guild)
    }
    startHealthPush()

    // Discord drops the bot's activity on every gateway resume — without
    // these the "/help • Xm" status disappears whenever the connection
    // blips and stays gone until someone runs a command.
    client.on('shardResume', () => { refreshPresence() })
    client.on('shardReady', () => { refreshPresence() })

    // DM the owner on startup
    if (env.BOT_OWNER_ID) {
      const owner = await c.users.fetch(env.BOT_OWNER_ID).catch(() => null)
      if (owner) {
        const guilds = [...c.guilds.cache.values()].map(g => `${g.name} (${g.id})`).join(', ')
        // 4096 = MessageFlags.SuppressNotifications — successful boot is informational
        await owner.send({
          content: `🟢 **Otterbot started**\nLogged in as **${c.user.tag}**\nGuilds: ${guilds}`,
          flags: 4096,
        } as any).catch(() => {})
      }
    }
  })
}
