import type { Client } from 'discord.js'
import { loadGuildCommandIds } from '../../utils/cmdMention'
import { startHealthPush } from '../healthPush'

export function registerReadyEvent(client: Client) {
  client.once('clientReady', async (c) => {
    console.log(`Logged in as ${c.user.tag}`)
    for (const [, guild] of c.guilds.cache) {
      await loadGuildCommandIds(guild)
    }
    startHealthPush()
  })
}
