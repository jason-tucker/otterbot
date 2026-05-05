import type { Client } from 'discord.js'
import { loadGuildCommandIds } from '../../utils/cmdMention'
import { startHealthPush } from '../healthPush'
import { initPresence } from '../../services/presence'

export function registerReadyEvent(client: Client) {
  client.once('clientReady', async (c) => {
    console.log(`Logged in as ${c.user.tag}`)
    initPresence(c)
    for (const [, guild] of c.guilds.cache) {
      await loadGuildCommandIds(guild)
    }
    startHealthPush()
  })
}
