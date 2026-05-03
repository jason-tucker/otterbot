import { REST, Routes } from 'discord.js'
import { env } from '../config/env'
import { ALL_GUILD_IDS } from '../config/guilds.config'
import { data as lookupData } from '../commands/lookup'
import { data as businessData } from '../commands/business'
import { data as moveChannelData } from '../commands/moveChannel'
import { data as printInfoData } from '../commands/printInfo'
import { data as artSizeData } from '../commands/artSize'
import { data as tcSheetData } from '../commands/tcSheet'
import { data as cakedData } from '../commands/caked'
import { data as userLookupData } from '../commands/userLookup'
import { data as helpData } from '../commands/help'
import { data as employeeData } from '../commands/employee'
import { data as employeeContextMenuData } from '../commands/employeeContextMenu'
import { data as portalData } from '../commands/portal'

const commands = [
  lookupData.toJSON(),
  businessData.toJSON(),
  moveChannelData.toJSON(),
  printInfoData.toJSON(),
  artSizeData.toJSON(),
  tcSheetData.toJSON(),
  cakedData.toJSON(),
  userLookupData.toJSON(),
  helpData.toJSON(),
  employeeData.toJSON(),
  employeeContextMenuData.toJSON(),
  portalData.toJSON(),
]
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
