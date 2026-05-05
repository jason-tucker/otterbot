// One-time script to seed OC stock items from the previous database.
// Run: DATABASE_URL=postgresql://otterbot:otterbot_dev@localhost:5433/otterbot node_modules/.bin/tsx scripts/seedOcStock.ts
// Safe to re-run — skips items that already exist by name.
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { ocStock } from '../src/db/schema/ocStock'
import { eq } from 'drizzle-orm'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1) }

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client)

const items: { name: string; status: 'in_stock' | 'low_stock' | 'out_of_stock'; sortOrder: number }[] = [
  // In Stock (18)
  { name: 'Apron (With Polo Tee)',    status: 'in_stock', sortOrder: 1 },
  { name: 'Armour/Vest',              status: 'in_stock', sortOrder: 2 },
  { name: 'Backpack',                 status: 'in_stock', sortOrder: 3 },
  { name: 'Baseball Cap',             status: 'in_stock', sortOrder: 4 },
  { name: 'Biker Helmet',             status: 'in_stock', sortOrder: 5 },
  { name: 'Chest Bag',                status: 'in_stock', sortOrder: 6 },
  { name: 'Duffelbag',                status: 'in_stock', sortOrder: 7 },
  { name: 'Face Bandana',             status: 'in_stock', sortOrder: 8 },
  { name: 'Joggers',                  status: 'in_stock', sortOrder: 9 },
  { name: 'Lanyard',                  status: 'in_stock', sortOrder: 10 },
  { name: 'Mechanic Overalls',        status: 'in_stock', sortOrder: 11 },
  { name: 'Neck Gaiter',              status: 'in_stock', sortOrder: 12 },
  { name: 'Open Jacket',              status: 'in_stock', sortOrder: 13 },
  { name: 'Pocket Flag',              status: 'in_stock', sortOrder: 14 },
  { name: 'T-Shirt',                  status: 'in_stock', sortOrder: 15 },
  { name: 'Slim Hoodie',              status: 'in_stock', sortOrder: 16 },
  { name: 'Sweatshirt (Jumper)',      status: 'in_stock', sortOrder: 17 },
  { name: 'Zipped Jacket',            status: 'in_stock', sortOrder: 18 },
  // Low Stock (3)
  { name: 'Baseball Tee (L-Sleeve Shirt)', status: 'low_stock', sortOrder: 19 },
  { name: 'Hoodie',                   status: 'low_stock', sortOrder: 20 },
  { name: 'Polo Tee',                 status: 'low_stock', sortOrder: 21 },
  // Out of Stock (1)
  { name: 'Kuttes',                   status: 'out_of_stock', sortOrder: 22 },
]

async function main() {
  let inserted = 0
  let skipped = 0

  for (const item of items) {
    const existing = await db.select().from(ocStock).where(eq(ocStock.name, item.name)).limit(1)
    if (existing.length > 0) {
      console.log(`  skip  ${item.name}`)
      skipped++
      continue
    }
    await db.insert(ocStock).values(item)
    console.log(`  ✓     ${item.name} (${item.status})`)
    inserted++
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed.`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
