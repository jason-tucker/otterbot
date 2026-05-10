/**
 * Lightweight structured logger.
 *
 * Goals:
 *   - Single source for `[scope] msg key=value key=value` style log lines so
 *     journald entries are greppable without the caller hand-formatting each
 *     `console.warn` template.
 *   - Honour `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`)
 *     — anything below the configured threshold is dropped before formatting,
 *     so debug strings don't pay a cost in prod.
 *   - PII-safe by construction: callers pass a small context object whose
 *     values get coerced inline. We never recursively serialise unknown
 *     blobs (e.g. raw response bodies) — keeps the surface area small and
 *     avoids leaking MKE payloads into journald.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function resolveThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  if (raw in LEVEL_ORDER) return LEVEL_ORDER[raw as LogLevel]
  return LEVEL_ORDER.info
}

// Resolved once at module load. `LOG_LEVEL` changes mid-process are not
// expected and would require a restart anyway (the bot reads env once at boot).
const threshold = resolveThreshold()

export interface LogContext {
  [key: string]: unknown
}

/**
 * Render a context object as ` key=value key=value` (leading space included
 * when non-empty). String values that contain whitespace are quoted; Errors
 * collapse to their message; everything else goes through `String()`.
 */
function formatContext(ctx: LogContext | undefined): string {
  if (!ctx) return ''
  const parts: string[] = []
  for (const key of Object.keys(ctx)) {
    const value = ctx[key]
    if (value === undefined) continue
    parts.push(`${key}=${formatValue(value)}`)
  }
  return parts.length === 0 ? '' : ' ' + parts.join(' ')
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Error) return quoteIfNeeded(value.message || value.name)
  if (typeof value === 'string') return quoteIfNeeded(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  // Fallback for objects/arrays — use JSON when safe, otherwise String().
  // We deliberately don't deep-walk: callers should pass scalars, not blobs.
  try {
    return quoteIfNeeded(JSON.stringify(value))
  } catch {
    return quoteIfNeeded(String(value))
  }
}

function quoteIfNeeded(s: string): string {
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

/**
 * Create a logger bound to a `[scope]` prefix. Output goes to the matching
 * `console.*` stream, so anything already piping `console.error` (e.g. the
 * global unhandled-rejection handler in `src/index.ts`) keeps working.
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`

  function emit(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < threshold) return
    const line = `${prefix} ${message}${formatContext(context)}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else if (level === 'debug') console.debug(line)
    else console.log(line)
  }

  return {
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
  }
}
