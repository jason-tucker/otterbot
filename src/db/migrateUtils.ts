// Pure helpers for src/db/migrate.ts (kept separate so tests can import them
// without running the migrator).

export const DEFAULT_LOCK_TIMEOUT_MS = 60_000

/** MIGRATION_LOCK_TIMEOUT_MS if it is a finite positive number, else 60000. */
export function parseLockTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_LOCK_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOCK_TIMEOUT_MS
}

/** Replaces `scheme://user:pass@` credentials, and any literal copy of the URL, with a mask. */
export function maskUrlCredentials(text: string, url?: string): string {
  let out = text
  if (url) out = out.split(url).join('<DATABASE_URL>')
  return out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, '$1***@')
}

/**
 * One-line description of an error for logs: only `code` and `message`, with
 * URL credentials masked. Never prints the error object (postgres-js TypeErrors
 * carry the full connection string, password included, in `input`).
 */
export function describeError(err: unknown, url?: string): string {
  const e = err as { code?: unknown; message?: unknown } | null | undefined
  const code = e && typeof e.code === 'string' ? e.code : undefined
  const message = e && typeof e.message === 'string' ? e.message : String(err)
  return maskUrlCredentials(code ? `${code}: ${message}` : message, url)
}
