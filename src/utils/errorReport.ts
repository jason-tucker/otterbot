import type { Client, TextChannel } from 'discord.js'
import { env } from '../config/env'

/**
 * Discord-visible error reporting.
 *
 * Otterbot had no Discord-side error sink before this — every failure only
 * ever reached `console.error` / journald. This adds an optional second
 * sink: a redacted, deduped summary posted to `LOG_CHANNEL_ID` (if
 * configured), so errors are visible without shelling into
 * `docker logs otterbot-otterbot-1`. Fire-and-forget everywhere; never
 * throws, so a misconfigured LOG_CHANNEL_ID can't make error reporting
 * itself fail the request it's reporting on.
 */

let cachedClient: Client | null = null

/**
 * Cache the discord.js Client so `errorReport` can post to LOG_CHANNEL_ID
 * without every call site threading a client through.
 *
 * Called once from `src/index.ts`, immediately after importing the
 * already-constructed `client` from `src/bot/client.ts` — the earliest
 * reliable point, and before `.login()` resolves. That matters because the
 * global `unhandledRejection` / `uncaughtException` handlers are also wired
 * in `src/index.ts` at that same point and can in principle fire before
 * `clientReady`; posting before login simply fails the channel fetch (not
 * yet authenticated), which `errorReport` swallows like any other post
 * failure.
 */
export function attachErrorReportClient(client: Client): void {
  cachedClient = client
}

// Secret substrings to strip from anything posted to LOG_CHANNEL_ID before it
// leaves the process. Substring-replace only — same known limits as any
// naive redaction (won't catch URL-encoded or re-cased copies), but it kills
// the obvious leak path (an error `.message` that embeds a token/connection
// string) with zero false positives. Mirrors squishybot's
// `src/services/logger.ts` `redact()`.
const SECRET_PATTERNS: Array<{ value: string | undefined; label: string }> = [
  { value: env.DISCORD_BOT_TOKEN, label: '[REDACTED:DISCORD_BOT_TOKEN]' },
  { value: env.EUPHORIC_API_KEY, label: '[REDACTED:EUPHORIC_API_KEY]' },
  { value: env.DATABASE_URL, label: '[REDACTED:DATABASE_URL]' },
  { value: env.GITHUB_TOKEN, label: '[REDACTED:GITHUB_TOKEN]' },
  { value: env.BOTPANEL_RPC_SECRET, label: '[REDACTED:BOTPANEL_RPC_SECRET]' },
]

function redact(s: string): string {
  let out = s
  for (const { value, label } of SECRET_PATTERNS) {
    if (value && value.length > 6 && out.includes(value)) {
      out = out.split(value).join(label)
    }
  }
  return out
}

// Dedup/rate-limit window for LOG_CHANNEL_ID posts — keyed by
// `${context}|${errorMessage}` so a recurring failure (e.g. a broken button
// handler getting clicked repeatedly) doesn't spam the channel once per
// interaction.
const REPORT_WINDOW_MS = 5 * 60 * 1000
const REPORT_MAP_CAP = 200

interface ReportEntry {
  lastPostedAt: number
  suppressed: number
}

const seen = new Map<string, ReportEntry>()

function pruneSeen(now: number): void {
  if (seen.size <= REPORT_MAP_CAP) return
  for (const [key, entry] of seen) {
    if (now - entry.lastPostedAt >= REPORT_WINDOW_MS) {
      seen.delete(key)
    }
  }
}

/**
 * Report a runtime error: always `console.error`s (existing convention),
 * then — if a client is attached (`attachErrorReportClient`) and
 * `LOG_CHANNEL_ID` is set — fire-and-forget posts a redacted, truncated
 * summary to that channel. Deduped per `context` + error message: at most
 * one post per key per 5 minutes, with a `(+N repeats suppressed)` suffix
 * appended once the window reopens. Never throws — channel fetch/send
 * failures are swallowed.
 */
export function errorReport(context: string, err: unknown): void {
  console.error(`[errorReport] ${context}`, err)

  if (!cachedClient || !env.LOG_CHANNEL_ID) return

  // Cap each component so the composed body stays under Discord's 2000-char
  // limit without the final slice cutting the closing code fence.
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 300)
  const stack = err instanceof Error && err.stack ? err.stack : ''
  const stackLines = stack.split('\n').slice(0, 8).join('\n').slice(0, 1000)

  const key = `${context}|${message}`
  const now = Date.now()
  const prev = seen.get(key)

  if (prev && now - prev.lastPostedAt < REPORT_WINDOW_MS) {
    prev.suppressed += 1
    return
  }

  const suppressedCount = prev?.suppressed ?? 0
  seen.set(key, { lastPostedAt: now, suppressed: 0 })
  pruneSeen(now)

  const suffix = suppressedCount > 0 ? `\n(+${suppressedCount} repeats suppressed)` : ''
  const body = redact(
    `🔴 **Interaction error** — ${context}\n\`\`\`\n${message}\n${stackLines}\n\`\`\`${suffix}`
  ).slice(0, 2000)

  const client = cachedClient
  const channelId = env.LOG_CHANNEL_ID
  client.channels
    .fetch(channelId)
    .then((channel) => {
      const textChannel = channel as TextChannel | null
      if (textChannel?.isTextBased()) {
        return textChannel.send({ content: body })
      }
    })
    .catch(() => {
      // never throw from error reporting
    })
}
