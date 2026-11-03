import { createHash } from 'node:crypto'

/**
 * GitHub-issue error sink.
 *
 * Files each distinct runtime error as a GitHub issue on `GITHUB_REPO`, so
 * errors can be read without shell access to the VPS (`docker logs`). Same
 * `GITHUB_TOKEN` / `GITHUB_REPO` as `/report` (fine-grained PAT, Issues R/W).
 *
 * - One issue per error fingerprint. The fingerprint ignores Discord IDs and
 *   other digit runs, so the same bug hit by different users lands in one
 *   issue. The title carries `[err:<fingerprint>]`.
 * - A repeat of an open issue's error adds a comment (max one comment per
 *   fingerprint per 30 min, per process).
 * - Max 10 new issues per process per hour, so an error storm cannot flood
 *   the repo.
 * - Never throws. All GitHub failures are swallowed with a console.warn.
 *
 * Pure of `env` so it can be unit-tested — `errorReport.ts` passes config in.
 */

export interface IssueSinkConfig {
  token: string
  repo: string
  /** Applied to every string that leaves the process. */
  redact: (s: string) => string
}

export interface ErrorIssueInput {
  context: string
  message: string
  stack: string
}

const COMMENT_WINDOW_MS = 30 * 60_000
const CREATE_WINDOW_MS = 60 * 60_000
const MAX_CREATES_PER_WINDOW = 10
const TITLE_PREFIX = '[auto-error]'

const lastCommentAt = new Map<string, number>()
/** fingerprint → open issue number, cached once found or created. */
const knownIssues = new Map<string, number>()
/** Fingerprints with a GitHub call in flight — collapses concurrent repeats. */
const inFlight = new Set<string>()
let createTimes: number[] = []

/** Test hook — reset all module state. */
export function _resetIssueSink(): void {
  lastCommentAt.clear()
  knownIssues.clear()
  inFlight.clear()
  createTimes = []
}

/** Strip per-user / per-guild IDs and other digit runs so one bug → one key. */
export function normalizeForFingerprint(s: string): string {
  return s.replace(/\d+/g, '#')
}

export function fingerprint(context: string, message: string): string {
  return createHash('sha1')
    .update(`${normalizeForFingerprint(context)}|${normalizeForFingerprint(message)}`)
    .digest('hex')
    .slice(0, 10)
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'otterbot-error-sink',
  }
}

async function gh(cfg: IssueSinkConfig, path: string, init?: { method: string; body: unknown }): Promise<Response> {
  return fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    method: init?.method ?? 'GET',
    headers: ghHeaders(cfg.token),
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
}

/** Find an open auto-error issue whose title carries this fingerprint. */
async function findOpenIssue(cfg: IssueSinkConfig, fp: string): Promise<number | null> {
  const res = await gh(cfg, '/issues?state=open&per_page=100&sort=created&direction=desc')
  if (!res.ok) throw new Error(`list issues HTTP ${res.status}`)
  const issues = (await res.json()) as Array<{ number: number; title: string; pull_request?: unknown }>
  const hit = issues.find((i) => !i.pull_request && i.title.includes(`[err:${fp}]`))
  return hit ? hit.number : null
}

function buildBody(cfg: IssueSinkConfig, input: ErrorIssueInput, heading: string): string {
  const stack = input.stack.split('\n').slice(0, 20).join('\n').slice(0, 4000)
  return cfg.redact(
    [
      heading,
      '',
      `**Context:** \`${input.context}\``,
      `**Time (UTC):** ${new Date().toISOString()}`,
      '',
      '```',
      input.message.slice(0, 1000),
      stack,
      '```',
    ].join('\n'),
  )
}

/**
 * File or update the GitHub issue for this error. Fire-and-forget: returns a
 * promise only so tests can await it. Never rejects.
 */
export async function reportErrorToIssue(cfg: IssueSinkConfig, input: ErrorIssueInput): Promise<void> {
  const fp = fingerprint(input.context, input.message)
  const now = Date.now()

  const last = lastCommentAt.get(fp)
  if (last !== undefined && now - last < COMMENT_WINDOW_MS) return
  if (inFlight.has(fp)) return
  inFlight.add(fp)
  lastCommentAt.set(fp, now)

  try {
    let issue = knownIssues.get(fp) ?? (await findOpenIssue(cfg, fp))

    if (issue !== null) {
      const res = await gh(cfg, `/issues/${issue}/comments`, {
        method: 'POST',
        body: { body: buildBody(cfg, input, 'The same error happened again.') },
      })
      if (res.ok) {
        knownIssues.set(fp, issue)
        return
      }
      // Issue gone or closed/locked — forget it and file a new one.
      knownIssues.delete(fp)
      issue = null
    }

    createTimes = createTimes.filter((t) => now - t < CREATE_WINDOW_MS)
    if (createTimes.length >= MAX_CREATES_PER_WINDOW) return
    createTimes.push(now)

    const title = cfg.redact(
      `${TITLE_PREFIX} ${normalizeForFingerprint(input.context).slice(0, 80)}: ${input.message.slice(0, 80)} [err:${fp}]`,
    )
    const res = await gh(cfg, '/issues', {
      method: 'POST',
      body: {
        title,
        body: buildBody(
          cfg,
          input,
          'Otterbot filed this issue automatically for a runtime error. Repeats are added as comments.',
        ),
      },
    })
    if (!res.ok) throw new Error(`create issue HTTP ${res.status}`)
    const data = (await res.json()) as { number: number }
    knownIssues.set(fp, data.number)
  } catch (err) {
    console.warn('[errorIssueSink] could not file error issue:', err instanceof Error ? err.message : String(err))
  } finally {
    inFlight.delete(fp)
  }
}
