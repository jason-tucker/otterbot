import 'dotenv/config'
import { env } from './config/env'
import { client } from './bot/client'
import { registerReadyEvent } from './bot/events/ready'
import { registerInteractionCreate } from './bot/events/interactionCreate'
import { registerTicketChannelCreate } from './bot/events/ticketChannelCreate'
import { setDnd, shutdownPresence } from './services/presence'
import { stopHealthPush } from './bot/healthPush'
import { closeDb } from './db/client'

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
 * Graceful shutdown. Two callers we care about:
 *
 *   - `systemctl restart` / `systemctl stop` → systemd sends SIGTERM. systemd
 *     bypasses Restart=on-failure for its own stops, so exit code doesn't
 *     matter here.
 *   - The CLAUDE.md deploy pattern (`kill -TERM $(ps …)`) → systemd sees an
 *     unexpected exit and uses Restart=on-failure to bring us back up. That
 *     requires a NON-zero exit code; cleanly `process.exit(0)` would leave
 *     the unit dead until manual `systemctl start`.
 *
 * SIGINT (Ctrl-C in dev) cleanly exits 0 — no systemd in that case.
 */
let shuttingDown = false
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal} — shutting down gracefully`)
  shutdownPresence()
  stopHealthPush()
  try { await client.destroy() } catch (err) { console.warn('client.destroy failed', err) }
  try { await closeDb() } catch (err) { console.warn('closeDb failed', err) }
  // SIGTERM → mimic the natural "unhandled signal" exit code (128 + 15 = 143)
  // so systemd's Restart=on-failure still triggers. SIGINT → clean exit.
  const code = signal === 'SIGTERM' ? 143 : 0
  setTimeout(() => process.exit(code), 2_000).unref()
}
process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT',  () => { void gracefulShutdown('SIGINT') })

client.login(env.DISCORD_BOT_TOKEN)
