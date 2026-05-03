import { REST, Routes } from 'discord.js'
import { env } from '../config/env'
import { ALL_GUILD_IDS } from '../config/guilds.config'
import { data as lookupData } from '../commands/lookup'
import { data as businessData } from '../commands/business'
import { data as moveChannelData } from '../commands/moveChannel'
import { data as printInfoData } from '../commands/printInfo'

const commands = [lookupData.toJSON(), businessData.toJSON(), moveChannelData.toJSON(), printInfoData.toJSON()]
const rest = new REST().setToken(env.DISCORD_BOT_TOKEN)

async function deploy() {
  for (const guildId of ALL_GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), { body: commands })
    console.log(`✓ Commands deployed to guild ${guildId}`)
  }
  console.log(`Deployed ${commands.length} command(s) to ${ALL_GUILD_IDS.length} guilds.`)
}

deploy().catch((err) => {
  console.error('Failed to deploy commands:', err)
  process.exit(1)
})
