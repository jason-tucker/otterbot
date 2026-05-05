import 'dotenv/config'
import { env } from './config/env'
import { client } from './bot/client'
import { registerReadyEvent } from './bot/events/ready'
import { registerInteractionCreate } from './bot/events/interactionCreate'
import { registerTicketChannelCreate } from './bot/events/ticketChannelCreate'
import { setDnd } from './services/presence'

registerReadyEvent(client)
registerInteractionCreate(client)
registerTicketChannelCreate(client)

process.on('unhandledRejection', (reason) => {
  setDnd('Unhandled error — check logs')
  console.error('Unhandled rejection:', reason)
})

process.on('uncaughtException', (err) => {
  setDnd('Uncaught exception — check logs')
  console.error('Uncaught exception:', err)
})

client.login(env.DISCORD_BOT_TOKEN)
