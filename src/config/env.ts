import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  // Guild IDs are hardcoded in guilds.config.ts — no env var needed
  DISCORD_PORTAL_ADMIN_ROLE_ID: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  EUPHORIC_API_BASE_URL: z.string().url().default('https://mke.api.euphoric.gg'),
  EUPHORIC_API_KEY: z.string().min(1, 'EUPHORIC_API_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
