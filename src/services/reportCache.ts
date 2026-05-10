import { randomBytes } from 'crypto'

export interface ReportSession {
  reporterId: string
  reporterTag: string
  title: string
  body: string
  labels: string[]
  createdAt: number
}

const MAX_ENTRIES = 500
const SWEEP_INTERVAL_MS = 30 * 60 * 1000
const sessions = new Map<string, ReportSession>()
const TTL_MS = 24 * 60 * 60 * 1000

function sweep(): void {
  const cutoff = Date.now() - TTL_MS
  for (const [k, v] of sessions) {
    if (v.createdAt < cutoff) sessions.delete(k)
  }
}

export function createReportSession(data: Omit<ReportSession, 'createdAt'>): string {
  sweep()
  const key = randomBytes(8).toString('hex')
  sessions.set(key, { ...data, createdAt: Date.now() })
  while (sessions.size > MAX_ENTRIES) {
    const oldestKey = sessions.keys().next().value
    if (oldestKey === undefined) break
    sessions.delete(oldestKey)
  }
  return key
}

export function getReportSession(key: string): ReportSession | undefined {
  return sessions.get(key)
}

export function deleteReportSession(key: string): void {
  sessions.delete(key)
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
sweepTimer.unref()

export function stopReportCacheSweep(): void {
  clearInterval(sweepTimer)
}
