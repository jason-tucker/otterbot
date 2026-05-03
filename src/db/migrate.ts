import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'

async function main() {
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 })
  const db = drizzle(migrationClient)
  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  await migrationClient.end()
  console.log('Migrations complete.')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
