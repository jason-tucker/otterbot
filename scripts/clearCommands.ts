import 'dotenv/config'
import { REST, Routes } from 'discord.js'
import { ALL_GUILD_IDS } from '../src/config/guilds.config'

const token = process.env.DISCORD_BOT_TOKEN
const clientId = process.env.DISCORD_CLIENT_ID

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID in .env')
  process.exit(1)
}

const rest = new REST().setToken(token)

async function main() {
  for (const guildId of ALL_GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
    console.log(`✓ Guild commands cleared for ${guildId}`)
  }

  await rest.put(Routes.applicationCommands(clientId), { body: [] })
  console.log('✓ Global commands cleared')

  console.log('\nDone. Now run: pnpm commands:deploy')
}

main().catch((err) => {
  console.error('Failed to clear commands:', err)
  process.exit(1)
})
