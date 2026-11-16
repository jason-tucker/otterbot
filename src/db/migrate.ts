// Guarded migrator. Applies the SQL files in src/db/migrations (tracked in
// drizzle.__drizzle_migrations) inside one transaction, under a Postgres
// advisory lock so concurrent starts serialise. Reads ONLY DATABASE_URL (no
// full env validation) so it can run before the bot's other config exists.
//
// Adoption guard: a database that already has the application tables but no
// baseline marker row was built by `drizzle-kit push`. Running the baseline
// against it would fail on "relation already exists", so we refuse to start and
// point at scripts/db/baseline-mark-applied.sql instead of guessing.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describeError, parseLockTimeout } from './migrateUtils'

// Arbitrary constant key for pg_advisory_lock ("otterbot" -> migrations).
const MIGRATION_LOCK_KEY = 7_340_911_203
// How long to wait for another migrator holding the lock before giving up.
const LOCK_TIMEOUT_MS = parseLockTimeout(process.env.MIGRATION_LOCK_TIMEOUT_MS)
const LOCK_POLL_MS = 500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Returns true when the advisory lock was acquired within the timeout.
async function acquireLock(client: postgres.Sql): Promise<boolean> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    const [row] = await client<{ ok: boolean }[]>`
      SELECT pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) AS ok`
    if (row.ok) return true
    if (Date.now() >= deadline) return false
    await sleep(LOCK_POLL_MS)
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? './src/db/migrations'

  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { when: number }[] }
  const baselineWhen = journal.entries[0]?.when
  if (typeof baselineWhen !== 'number') throw new Error('Migration journal has no baseline entry')

  let client: postgres.Sql | undefined
  let exitCode = 0
  let locked = false
  try {
    // Inside the try: postgres() throws a TypeError for a malformed URL whose
    // `input` holds the full URL (password included); never print that object.
    client = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} })
    console.log('Running migrations...')
    locked = await acquireLock(client)
    if (!locked) {
      console.error(
        `Migration failed: could not acquire the migration advisory lock within ${LOCK_TIMEOUT_MS} ms ` +
          '(another migrator or a stuck session holds it).',
      )
      exitCode = 1
    }

    if (locked) {
      const [state] = await client<{ has_app: boolean; has_log: boolean }[]>`
        SELECT to_regclass('public.businesses') IS NOT NULL AS has_app,
               to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS has_log`
      let marked = false
      if (state.has_log) {
        const rows = await client`
          SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at >= ${baselineWhen} LIMIT 1`
        marked = rows.length > 0
      }
      if (state.has_app && !marked) {
        console.error(
          'DB has tables but no baseline marker; run scripts/db/baseline-mark-applied.sql ' +
            '(see docs/DEPLOYMENT.md) before starting. Refusing to migrate.',
        )
        exitCode = 1
      } else if (!state.has_app && marked) {
        console.error(
          'Baseline marker row exists but the public application tables are missing ' +
            '(database restored or wiped without its drizzle schema?). Refusing to migrate: ' +
            'the migrator would skip the baseline and leave the bot without tables. ' +
            'Either restore the tables, or DROP SCHEMA drizzle CASCADE on an empty database and retry.',
        )
        exitCode = 1
      }
    }

    if (exitCode === 0) {
      await migrate(drizzle(client), { migrationsFolder })
      console.log('Migrations complete.')
    }
  } catch (err) {
    console.error('Migration failed:', describeError(err, url))
    exitCode = 1
  } finally {
    if (locked && client) {
      try {
        await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`
      } catch {
        // connection may be dead; the lock dies with the session anyway
      }
    }
    await client?.end({ timeout: 5 })
  }
  if (exitCode !== 0) process.exit(exitCode)
}

main().catch((err) => {
  console.error('Migration failed:', describeError(err, process.env.DATABASE_URL))
  process.exit(1)
})
