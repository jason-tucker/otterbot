/**
 * `report.submit` — RPC verb that mirrors the `/report` slash modal.
 *
 * The panel's `/report` page POSTs Title / Type / Description / Steps into a
 * route that calls this verb on the requesting user's behalf. The DM-the-
 * owner + GitHub-issue-on-approval flow is the bot's responsibility and is
 * shared with the in-bot path via `reportRequestService.submitReport()`.
 *
 * Params:
 *   { userId: snowflake, title: string, type: string,
 *     description: string, steps?: string }
 *
 * Returns the underlying service result on success:
 *   { ok: true, data: { sessionKey, ownerNotified: true } }
 *
 * On failure returns the service's machine-token error so the panel can
 * render the right toast — `not-configured`, `owner-unset`, `missing-fields`,
 * `owner-dm-failed`. Bad params shape errors as `bad-params` before we ever
 * call the service.
 */
import { registerVerb, type VerbHandler } from '../registry'
import { submitReport } from '../../reportRequestService'
import { parseSnowflake } from '../../../utils/validators'

type ReportSubmitParams = {
  userId: string
  title: string
  type: string
  description: string
  steps?: string
}

/**
 * Per-user cooldown for the RPC path, mirroring the `/report` slash command's
 * 5-minute limit. The slash path throttles in `commands/report.ts`, but this
 * verb bypassed it entirely — a panel (or anyone with the RPC secret) could
 * spam the owner's DMs and queue GitHub issues without limit.
 */
const REPORT_COOLDOWN_MS = 5 * 60_000
const lastReportAt = new Map<string, number>()
function sweepReportCooldowns(): void {
  const cutoff = Date.now() - REPORT_COOLDOWN_MS
  for (const [k, t] of lastReportAt) if (t < cutoff) lastReportAt.delete(k)
}

function isReportSubmitParams(v: unknown): v is ReportSubmitParams {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  // userId is fetched via client.users.fetch(); require a real snowflake,
  // consistent with the other RPC verbs (was: any non-empty string).
  if (!parseSnowflake(p.userId)) return false
  if (typeof p.title !== 'string') return false
  if (typeof p.type !== 'string') return false
  if (typeof p.description !== 'string') return false
  if (p.steps !== undefined && typeof p.steps !== 'string') return false
  return true
}

export const reportSubmitHandler: VerbHandler = async (params, ctx) => {
  if (!isReportSubmitParams(params)) {
    return {
      ok: false,
      error: 'bad-params',
      details: 'expected { userId, title, type, description, steps? }',
    }
  }

  const last = lastReportAt.get(params.userId) ?? 0
  const remaining = REPORT_COOLDOWN_MS - (Date.now() - last)
  if (remaining > 0) {
    return {
      ok: false,
      error: 'rate-limited',
      details: `try again in ~${Math.ceil(remaining / 1000)}s`,
    }
  }
  if (lastReportAt.size > 200) sweepReportCooldowns()
  lastReportAt.set(params.userId, Date.now())

  const result = await submitReport({
    client: ctx.client,
    userId: params.userId,
    title: params.title,
    type: params.type,
    description: params.description,
    steps: params.steps,
  })

  if (!result.ok) {
    return { ok: false, error: result.error, details: result.details }
  }
  return {
    ok: true,
    data: { sessionKey: result.sessionKey, ownerNotified: result.ownerNotified },
  }
}

registerVerb('report.submit', reportSubmitHandler)
