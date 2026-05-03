// Syncs businesses.config.ts → database for all configured guilds.
// Run: pnpm db:seed
// Safe to run multiple times (upserts, non-destructive for runtime data).

import 'dotenv/config'
import { REST, Routes } from 'discord.js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, and } from 'drizzle-orm'
import { businesses, businessRoleMappings } from '../src/db/schema'
import { BUSINESSES } from '../src/config/businesses.config'
import { ALL_GUILD_IDS } from '../src/config/guilds.config'

const DATABASE_URL = process.env.DATABASE_URL
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

if (!DATABASE_URL || !BOT_TOKEN) {
  console.error('❌ Missing DATABASE_URL or DISCORD_BOT_TOKEN in .env')
  process.exit(1)
}

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client)
const rest = new REST().setToken(BOT_TOKEN)

async function seedGuild(guildId: string) {
  console.log(`\n━━━ Guild ${guildId} ━━━`)

  const guildRoles = (await rest.get(Routes.guildRoles(guildId))) as Array<{
    id: string
    name: string
  }>
  const roleMap = new Map(guildRoles.map((r) => [r.name, r.id]))
  console.log(`Fetched ${guildRoles.length} roles from guild.`)

  for (const config of BUSINESSES) {
    // Look up by slug — businesses are not guild-scoped (role mappings are)
    const existing = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, config.slug))
      .limit(1)

    let businessId: string

    if (existing.length > 0) {
      businessId = existing[0].id
      // Update name/provider/settings only — don't overwrite runtime changes
      await db
        .update(businesses)
        .set({
          name: config.name,
          providerType: config.providerType,
          settings: config.settings as Record<string, unknown> ?? existing[0].settings,
        })
        .where(eq(businesses.id, businessId))
    } else {
      const inserted = await db
        .insert(businesses)
        .values({
          name: config.name,
          slug: config.slug,
          providerType: config.providerType,
          guildId,
          active: true,
          settings: (config.settings as Record<string, unknown>) ?? {},
        })
        .returning({ id: businesses.id })
      businessId = inserted[0].id
    }

    // Replace role mappings for this business+guild
    await db
      .delete(businessRoleMappings)
      .where(and(eq(businessRoleMappings.businessId, businessId), eq(businessRoleMappings.guildId, guildId)))

    let mapped = 0
    let missing = 0

    for (const role of config.roles) {
      const roleId = roleMap.get(role.name)
      if (!roleId) {
        console.warn(`  ⚠️  "${config.name}" — role not found in guild: "${role.name}"`)
        missing++
        continue
      }

      await db.insert(businessRoleMappings).values({
        businessId,
        guildId,
        roleId,
        roleName: role.name,
        rank: role.rank,
        label: role.name,
        isBase: false,
        autoGrantEmployee: false,
        minRankToAssign: 'manager',
      })
      mapped++
    }

    const status = missing > 0 ? `⚠️  ${mapped} mapped, ${missing} missing` : `✓ ${mapped} roles`
    console.log(`  ${config.name}: ${status}`)
  }
}

async function main() {
  for (const guildId of ALL_GUILD_IDS) {
    await seedGuild(guildId)
  }

  await client.end()
  console.log('\n✅ Seed complete.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
