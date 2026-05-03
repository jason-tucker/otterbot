/**
 * Role scanner — verifies that every role name in employee-businesses.config.ts
 * exists in the Discord server.
 *
 * Usage:
 *   pnpm scan:roles            (scans dev guild by default)
 *   NODE_ENV=production pnpm scan:roles
 *
 * Output: a per-business table of found/missing roles with their Discord IDs.
 * Use this output to confirm role names are correct before deploying.
 */
import 'dotenv/config'
import { Client, GatewayIntentBits } from 'discord.js'
import { EMPLOYEE_BUSINESSES } from '../src/config/employee-businesses.config'
import { GUILDS } from '../src/config/guilds.config'

const token = process.env.DISCORD_BOT_TOKEN
if (!token) {
  console.error('DISCORD_BOT_TOKEN is not set in .env')
  process.exit(1)
}

const guildId =
  process.env.NODE_ENV === 'production' ? GUILDS.production : GUILDS.dev

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(guildId)
    const roles = await guild.roles.fetch()

    // Build a lookup map: role name → role ID
    const roleMap = new Map<string, string>()
    for (const [id, role] of roles) {
      roleMap.set(role.name, id)
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  Role Scan — ${guild.name} (${guildId})`)
    console.log(`${'='.repeat(60)}`)

    let totalFound = 0
    let totalMissing = 0

    for (const biz of EMPLOYEE_BUSINESSES) {
      console.log(`\n📦  ${biz.name}`)

      const entries = [
        { category: 'Employee', entry: biz.roles.employee },
        { category: 'Manager', entry: biz.roles.manager },
        { category: 'Owner', entry: biz.roles.owner },
        ...biz.roles.custom.map((c) => ({ category: `Custom: ${c.label}`, entry: c })),
      ]

      for (const { category, entry } of entries) {
        const foundId = roleMap.get(entry.name)
        if (foundId) {
          console.log(`  ✅  ${category.padEnd(28)} "${entry.name}" → ${foundId}`)
          totalFound++
        } else {
          console.log(`  ❌  ${category.padEnd(28)} "${entry.name}" — NOT FOUND in server`)
          totalMissing++
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  Result: ${totalFound} found, ${totalMissing} missing`)
    if (totalMissing > 0) {
      console.log('  ⚠️  Fix missing role names in src/config/employee-businesses.config.ts')
      console.log('     Role names are case-sensitive and must match the server exactly.')
    } else {
      console.log('  ✅  All configured roles exist in the server.')
    }
    console.log(`${'='.repeat(60)}\n`)
  } catch (err) {
    console.error('Scan failed:', err)
    process.exit(1)
  } finally {
    await client.destroy()
  }
})

client.login(token).catch((err) => {
  console.error('Discord login failed:', err)
  process.exit(1)
})
