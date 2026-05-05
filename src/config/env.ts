import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  EUPHORIC_API_BASE_URL: z.string().url().default('https://mke.api.euphoric.gg'),
  EUPHORIC_API_KEY: z.string().min(1, 'EUPHORIC_API_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Comma-separated Discord role IDs that grant sudo/admin access to the bot.
  // Anyone with one of these roles can use /portal and bypass business permission limits.
  SUDO_ROLE_IDS: z.string().optional(),
  // Legacy — treated as an additional sudo role if present.
  DISCORD_PORTAL_ADMIN_ROLE_ID: z.string().optional(),
  UPTIME_KUMA_PUSH_URL: z.string().url().optional(),
  BOT_OWNER_ID: z.string().optional(),
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

// Build the final sudo role ID list: SUDO_ROLE_IDS + legacy DISCORD_PORTAL_ADMIN_ROLE_ID
const sudoRoleIds = [
  ...(raw.SUDO_ROLE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ...(raw.DISCORD_PORTAL_ADMIN_ROLE_ID ? [raw.DISCORD_PORTAL_ADMIN_ROLE_ID] : []),
].filter((id, idx, arr) => arr.indexOf(id) === idx) // deduplicate

export const env = { ...raw, sudoRoleIds }
