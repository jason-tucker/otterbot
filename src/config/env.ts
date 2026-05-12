import { z } from 'zod'
import 'dotenv/config'

const SNOWFLAKE_RE = /^\d{17,20}$/
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().regex(SNOWFLAKE_RE, 'must be a Discord snowflake'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  EUPHORIC_API_BASE_URL: z.string().url().default('https://mke.api.euphoric.gg'),
  EUPHORIC_API_KEY: z.string().min(1, 'EUPHORIC_API_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Comma-separated Discord role IDs that grant sudo/admin access to the bot.
  // Anyone with one of these roles can use /portal and bypass business permission limits.
  // Each non-empty entry must be a Discord snowflake — typos abort startup instead of
  // being silently dropped.
  SUDO_ROLE_IDS: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true
        const tokens = val.split(',').map((s) => s.trim()).filter(Boolean)
        return tokens.every((t) => SNOWFLAKE_RE.test(t))
      },
      { message: 'each entry must be a Discord snowflake' },
    ),
  // Legacy — treated as an additional sudo role if present.
  DISCORD_PORTAL_ADMIN_ROLE_ID: z.string().regex(SNOWFLAKE_RE, 'must be a Discord snowflake').optional(),
  UPTIME_KUMA_PUSH_URL: z.string().url().optional(),
  BOT_OWNER_ID: z.string().regex(SNOWFLAKE_RE, 'must be a Discord snowflake').optional(),

  // /report — files GitHub issues from inside Discord
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().regex(REPO_RE, 'must be in `owner/name` form').optional(),

  // botpanel RPC command-bus — shared HMAC secret used to verify inbound
  // `cmd.otter.*` envelopes from the panel. Optional: if unset, the RPC
  // subscriber logs a warning at startup and never connects, so the bot
  // continues to function as a publish-only client.
  BOTPANEL_RPC_SECRET: z.string().min(1).optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

const raw = parsed.data

// Build the final sudo role ID list: SUDO_ROLE_IDS + legacy DISCORD_PORTAL_ADMIN_ROLE_ID.
// SUDO_ROLE_IDS tokens are snowflake-validated by the schema above.
const sudoRoleIds = [
  ...(raw.SUDO_ROLE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ...(raw.DISCORD_PORTAL_ADMIN_ROLE_ID ? [raw.DISCORD_PORTAL_ADMIN_ROLE_ID] : []),
].filter((id, idx, arr) => arr.indexOf(id) === idx) // deduplicate

export const env = { ...raw, sudoRoleIds }
