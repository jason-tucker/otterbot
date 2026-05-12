import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Client,
} from 'discord.js'
import { loadGuildCommandIds } from '../../utils/cmdMention'
import { startHealthPush } from '../healthPush'
import { initPresence, refreshPresence } from '../../services/presence'
import { env } from '../../config/env'
import { publishHeartbeat, publishReady } from '../../services/eventBus'

const SUPPRESS_NOTIFICATIONS = 1 << 12  // MessageFlags.SuppressNotifications

// Heartbeat cadence — must match what the panel expects on
// `bot.otter.bot.heartbeat`. Botpanel marks a bot "stale" if it doesn't
// see a heartbeat within ~2× this interval.
const HEARTBEAT_INTERVAL_MS = 60_000

// Module-level handle so a future reconnect / re-ready path doesn't double
// the ticker. `unref()` so it doesn't block clean exit on SIGTERM.
let heartbeatTimer: NodeJS.Timeout | null = null

function sep() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
}

export function registerReadyEvent(client: Client) {
  client.once('clientReady', async (c) => {
    console.log(`Logged in as ${c.user.tag}`)
    initPresence(c)

    // Botpanel integration: one-shot `bot.ready` event + 60 s heartbeat
    // ticker on `bot.otter.bot.heartbeat`. Both are fire-and-forget — Redis
    // hiccups are logged inside `publish()` and never crash the bot.
    void publishReady(c)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => { void publishHeartbeat(c) }, HEARTBEAT_INTERVAL_MS)
    heartbeatTimer.unref()

    for (const [, guild] of c.guilds.cache) {
      await loadGuildCommandIds(guild)
    }
    startHealthPush()

    // Discord drops the bot's activity on every gateway resume — without
    // these the "/help • Xm" status disappears whenever the connection
    // blips and stays gone until someone runs a command.
    client.on('shardResume', () => { refreshPresence() })
    client.on('shardReady', () => { refreshPresence() })

    // Rich CV2 startup card to BOT_OWNER_ID.
    if (env.BOT_OWNER_ID) {
      const owner = await c.users.fetch(env.BOT_OWNER_ID).catch(() => null)
      if (owner) {
        // Pull build metadata if available; harmless when absent locally.
        let version = '?'
        try {
          const pkg = await import('../../../package.json' as any)
          version = (pkg as any).version ?? '?'
        } catch {}
        const sha = (process.env.GIT_SHA ?? process.env.SOURCE_COMMIT ?? '').slice(0, 7) || 'unset'
        const nowSec = Math.floor(Date.now() / 1000)

        const guildLines = [...c.guilds.cache.values()]
          .map(g => `• ${g.name} (\`${g.id}\`)`)
          .join('\n') || '_(not a member of any guild)_'

        const container = new ContainerBuilder()
          .setAccentColor(0xed8936)  // otter-ish orange
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🦦 OtterBot is up'))
          .addSeparatorComponents(sep())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**${c.user.tag}** · booted <t:${nowSec}:R>\n` +
            `**Version** \`${version}\` · **Build** \`${sha}\``
          ))
          .addSeparatorComponents(sep())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🏠 Guilds\n${guildLines}`
          ))
          .addSeparatorComponents(sep())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '_Ready to roll. `/portal` for business admin, `/employee` to manage staff._'
          ))

        await owner.send({
          flags: (MessageFlags.IsComponentsV2 as number) | SUPPRESS_NOTIFICATIONS,
          components: [container],
        } as any).catch(() => {})
      }
    }
  })
}
