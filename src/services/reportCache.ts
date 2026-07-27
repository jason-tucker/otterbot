import { randomBytes } from 'crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db/client'
import { reportSessions } from '../db/schema'

// DB-backed /report review session — mirrors the lookup_sessions pattern
// (see src/services/interactionCache.ts::storeLookupSession) so it survives
// bot restarts. Watchtower auto-restarts the bot on every deploy, which used
// to wipe the old in-memory Map and silently drop any /report the owner
// hadn't yet reviewed — the owner's "Approve" click would just say "session
// expired" with no GitHub issue ever filed.
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days — owner review can take days

export interface ReportSession {
  reporterId: string
  reporterTag: string
  title: string
  body: string
  labels: string[]
  createdAt: Date
}

function makeKey(): string {
  return randomBytes(8).toString('hex')
}

// Opportunistic sweep — throttled and fire-and-forget so it never adds
// latency to (or fails) the interaction that triggered it.
const SWEEP_MIN_INTERVAL_MS = 5 * 60 * 1000
let lastSweepAt = 0

export async function createReportSession(data: Omit<ReportSession, 'createdAt'>): Promise<string> {
  const key = makeKey()
  const expiresAt = new Date(Date.now() + TTL_MS)
  await db.insert(reportSessions).values({ key, ...data, expiresAt })
  const now = Date.now()
  if (now - lastSweepAt >= SWEEP_MIN_INTERVAL_MS) {
    lastSweepAt = now
    void db.delete(reportSessions).where(lt(reportSessions.expiresAt, new Date())).catch(() => {})
  }
  return key
}

export async function getReportSession(key: string): Promise<ReportSession | undefined> {
  const [row] = await db
    .select()
    .from(reportSessions)
    .where(and(eq(reportSessions.key, key), gt(reportSessions.expiresAt, new Date())))
    .limit(1)
  if (!row) return undefined
  return {
    reporterId: row.reporterId,
    reporterTag: row.reporterTag,
    title: row.title,
    body: row.body,
    labels: row.labels as string[],
    createdAt: row.createdAt,
  }
}

export async function deleteReportSession(key: string): Promise<void> {
  await db.delete(reportSessions).where(eq(reportSessions.key, key))
}
