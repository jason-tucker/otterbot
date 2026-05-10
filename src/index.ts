import 'dotenv/config'
import { env } from './config/env'
import { client } from './bot/client'
import { registerReadyEvent } from './bot/events/ready'
import { registerInteractionCreate } from './bot/events/interactionCreate'
import { registerTicketChannelCreate } from './bot/events/ticketChannelCreate'
import { setDnd } from './services/presence'
import { stopHealthPush } from './bot/healthPush'

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

/**
 * Graceful shutdown — systemd sends SIGTERM on `systemctl restart`. Without
 * a handler the gateway connection drops abruptly + the health-push interval
 * keeps spinning until the kill timeout, costing a few seconds of "RECONNECTING"
 * on every deploy. Tear things down explicitly.
 */
let shuttingDown = false
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal} — shutting down gracefully`)
  stopHealthPush()
  try { await client.destroy() } catch (err) { console.warn('client.destroy failed', err) }
  setTimeout(() => process.exit(0), 2_000).unref()
}
process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT',  () => { void gracefulShutdown('SIGINT') })

client.login(env.DISCORD_BOT_TOKEN)
