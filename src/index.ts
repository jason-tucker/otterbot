import 'dotenv/config'
import { env } from './config/env'
import { client } from './bot/client'
import { registerReadyEvent } from './bot/events/ready'
import { registerInteractionCreate } from './bot/events/interactionCreate'
import { registerTicketChannelCreate } from './bot/events/ticketChannelCreate'
import { setDnd, shutdownPresence } from './services/presence'
import { stopHealthPush } from './bot/healthPush'
import { closeDb } from './db/client'
import { startRpcServer, closeRpcServer } from './services/rpcServer'
import { startCacheInvalidator, closeCacheInvalidator } from './services/cacheInvalidator'
import { closeEventBus } from './services/eventBus'
import { stopInteractionCacheSweep } from './services/interactionCache'
import { runShutdown } from './shutdown'
import { attachErrorReportClient, errorReport } from './utils/errorReport'

// Earliest reliable point to hand the client to errorReport — `client` is
// already constructed (see src/bot/client.ts), and this runs before
// `.login()` below, so the unhandledRejection/uncaughtException handlers
// immediately following also have a client to post with.
attachErrorReportClient(client)

registerReadyEvent(client)
registerInteractionCreate(client)
registerTicketChannelCreate(client)

process.on('unhandledRejection', (reason) => {
  setDnd('Unhandled error — check logs')
  console.error('Unhandled rejection:', reason)
  errorReport('unhandledRejection', reason)
})

process.on('uncaughtException', (err) => {
  setDnd('Uncaught exception — check logs')
  console.error('Uncaught exception:', err)
  errorReport('uncaughtException', err)
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
  // Order matters: stop inbound work (RPC + cache-invalidate subscribers, the
  // interaction-cache sweep) before the gateway client goes away, then close
  // the publisher and DB last. Each step is isolated (see shutdown.ts).
  await runShutdown([
    ['closeRpcServer', closeRpcServer],
    ['closeCacheInvalidator', closeCacheInvalidator],
    ['stopInteractionCacheSweep', stopInteractionCacheSweep],
    ['client.destroy', () => client.destroy()],
    // The lazily-opened Redis publisher (audit/event bus) would otherwise leak
    // its socket and could keep the event loop alive.
    ['closeEventBus', closeEventBus],
    ['closeDb', closeDb],
  ])
  // SIGTERM → mimic the natural "unhandled signal" exit code (128 + 15 = 143)
  // so systemd's Restart=on-failure still triggers. SIGINT → clean exit.
  const code = signal === 'SIGTERM' ? 143 : 0
  setTimeout(() => process.exit(code), 2_000).unref()
}
process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT',  () => { void gracefulShutdown('SIGINT') })

client
  .login(env.DISCORD_BOT_TOKEN)
  .then(() => {
    // Wire the botpanel RPC subscriber once the gateway login resolves so
    // handlers always have a logged-in client to dispatch against. The
    // subscriber itself is non-blocking — if Redis is down or the secret
    // isn't set, it logs and returns without throwing.
    startRpcServer(client)
    // V3-1 cache-invalidate subscriber — reload in-memory business and
    // mckenzie caches on HMAC-signed events from botpanel. Non-blocking.
    // Tracks botpanel #33 / V3-1.
    startCacheInvalidator()
  })
  .catch((err) => {
    console.error('client.login failed', err)
  })
