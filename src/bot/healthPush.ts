import { env } from '../config/env'
import { createLogger } from '../utils/logger'

const log = createLogger('health')

let timer: ReturnType<typeof setInterval> | null = null
let lastFailureLogAt = 0
const FAILURE_LOG_INTERVAL_MS = 5 * 60_000

export function startHealthPush(intervalMs = 60_000): void {
  const url = env.UPTIME_KUMA_PUSH_URL
  if (!url) return
  // Capture the handle so a graceful shutdown can clear it; also guard
  // against double-invocation (a future re-ready / reconnect path) so the
  // interval doesn't accumulate.
  if (timer) return

  timer = setInterval(async () => {
    try {
      // Bound the push so a hung Kuma endpoint can't leave a socket dangling
      // every minute (the interval keeps firing regardless).
      await fetch(url, { signal: AbortSignal.timeout(5_000) })
    } catch (err) {
      // Kuma alerts when pushes stop arriving, but a persistent local failure
      // (bad URL / DNS) left zero local signal before. Log at most once per
      // 5 minutes so journald isn't spammed every interval.
      const now = Date.now()
      if (now - lastFailureLogAt >= FAILURE_LOG_INTERVAL_MS) {
        lastFailureLogAt = now
        log.warn('uptime-kuma push failed', { err: err instanceof Error ? err : String(err) })
      }
    }
  }, intervalMs)
  timer.unref?.()
}

export function stopHealthPush(): void {
  if (timer) { clearInterval(timer); timer = null }
}
