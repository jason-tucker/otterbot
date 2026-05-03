import 'dotenv/config'
import { env } from './config/env'
import { client } from './bot/client'
import { registerReadyEvent } from './bot/events/ready'
import { registerInteractionCreate } from './bot/events/interactionCreate'
import { registerTicketChannelCreate } from './bot/events/ticketChannelCreate'

registerReadyEvent(client)
registerInteractionCreate(client)
registerTicketChannelCreate(client)

client.login(env.DISCORD_BOT_TOKEN)
