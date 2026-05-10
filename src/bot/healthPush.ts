import { env } from '../config/env'

let timer: ReturnType<typeof setInterval> | null = null

export function startHealthPush(intervalMs = 60_000): void {
  const url = env.UPTIME_KUMA_PUSH_URL
  if (!url) return
  // Capture the handle so a graceful shutdown can clear it; also guard
  // against double-invocation (a future re-ready / reconnect path) so the
  // interval doesn't accumulate.
  if (timer) return

  timer = setInterval(async () => {
    try {
      await fetch(url)
    } catch {
      // silently swallow — Kuma will alert if pushes stop arriving
    }
  }, intervalMs)
  timer.unref?.()
}

export function stopHealthPush(): void {
  if (timer) { clearInterval(timer); timer = null }
}
