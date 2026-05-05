// Updates OC stock items with product page URLs scraped from ruubzz.wixsite.com/mysite/shop
// Run: DATABASE_URL=postgresql://otterbot:otterbot_dev@localhost:5433/otterbot node_modules/.bin/tsx scripts/updateOcUrls.ts
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { ocStock } from '../src/db/schema/ocStock'
import { eq } from 'drizzle-orm'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1) }

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client)

const urls: Record<string, string> = {
  'Apron (With Polo Tee)':        'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-apron',
  'Armour/Vest':                   'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-tactical-vest',
  'Backpack':                      'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-backpack',
  'Baseball Cap':                  'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-baseball-hat',
  'Biker Helmet':                  'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-biker-helmet',
  'Duffelbag':                     'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-duffle-bag',
  'Face Bandana':                  'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-bandana-mask',
  'Joggers':                       'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-joggers',
  'Lanyard':                       'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-lanyard',
  'Mechanic Overalls':             'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-mechanic-overalls',
  'Neck Gaiter':                   'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-neck-gaiter-mask',
  'Open Jacket':                   'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-open-jacket',
  'Pocket Flag':                   'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-pocket-flag',
  'T-Shirt':                       'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-t-shirt',
  'Slim Hoodie':                   'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-slim-hoodie',
  'Sweatshirt (Jumper)':           'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-sweatshirt',
  'Zipped Jacket':                 'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-zipped-jacket',
  'Baseball Tee (L-Sleeve Shirt)': 'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-baseball-shirt',
  'Hoodie':                        'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-hoodie',
  'Polo Tee':                      'https://ruubzz.wixsite.com/mysite/product-page/original-clothing-polo-tee',
  // Chest Bag and Kuttes: URLs not found on website — add manually via /oc Manage Stock
}

async function main() {
  let updated = 0
  let notFound = 0

  for (const [name, url] of Object.entries(urls)) {
    const result = await db.update(ocStock).set({ url }).where(eq(ocStock.name, name))
    // @ts-ignore — rowCount exists at runtime
    if (result.rowCount > 0) {
      console.log(`  ✓  ${name}`)
      updated++
    } else {
      console.log(`  ?  ${name} — not in DB`)
      notFound++
    }
  }

  const missing = ['Chest Bag', 'Kuttes']
  console.log(`\n⚠️  No URL found for: ${missing.join(', ')} — add via /oc → Manage Stock → Set Product Link`)
  console.log(`\nDone: ${updated} updated, ${notFound} not in DB.`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
