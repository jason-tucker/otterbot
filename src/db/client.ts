import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'
import * as schema from './schema'

// Pool tuning: bound concurrent connections so a burst of interactions can't
// exhaust the Postgres `max_connections` budget; reap idle sockets after 30 s
// so a quiet bot doesn't hold sockets open indefinitely; fail fast if the
// initial connect can't be made within 10 s instead of hanging an interaction.
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
})
export const db = drizzle(queryClient, { schema })

// Called from gracefulShutdown in `src/index.ts`. The 5 s timeout is in
// SECONDS (postgres-js convention) and bounds how long we wait for in-flight
// queries to drain before forcibly closing sockets.
export async function closeDb(): Promise<void> {
  await queryClient.end({ timeout: 5 })
}
