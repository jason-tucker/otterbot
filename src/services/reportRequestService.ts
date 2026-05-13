/**
 * Shared "open a report and DM the owner" pipeline.
 *
 * Both the `/report` slash modal submit handler (`interactions/modals/reportSubmit.ts`)
 * and the `report.submit` RPC verb (`services/rpc/handlers/report.ts`) call into
 * this helper so the surfaces share one canonical implementation. Refactoring
 * the modal to delegate here means anything that ever changes about
 * formatting, label inference, or the DM payload touches one file.
 *
 * Behavior, in order:
 *   1. Validate required fields + env (GITHUB_TOKEN / GITHUB_REPO / BOT_OWNER_ID).
 *   2. Infer GitHub labels from the free-text `type` ("bug" → `bug`, "feat" →
 *      `enhancement`, "quest" → `question`).
 *   3. Compose the issue body, including the reporter's tag + id footer.
 *   4. Allocate a `sessionKey` and store the report payload in `reportCache`.
 *   5. DM the bot owner with the four Approve/Reject buttons (customIds carry
 *      the sessionKey).
 *
 * Returns:
 *   - `{ ok: true, sessionKey, ownerNotified: true }` on success (owner DM
 *     succeeded). The report is queued and ready for review.
 *   - `{ ok: false, error }` on env/validation failure or owner-DM failure.
 *     `error` is a stable machine token — `not-configured`, `owner-unset`,
 *     `missing-fields`, `owner-dm-failed` — so callers can render friendly
 *     messages without parsing strings.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js'
import { env } from '../config/env'
import { createLogger } from '../utils/logger'
import { createReportSession } from './reportCache'

const logger = createLogger('reportRequestService')

export type SubmitReportInput = {
  client: Client
  userId: string
  /** Caller's Discord display name (e.g. `Username#1234`). Used in the owner DM. */
  userTag?: string
  title: string
  type: string
  description: string
  steps?: string
}

export type SubmitReportResult =
  | { ok: true; sessionKey: string; ownerNotified: true }
  | { ok: false; error: 'not-configured' | 'owner-unset' | 'missing-fields' | 'owner-dm-failed' | 'unknown'; details?: string }

function inferLabels(type: string): string[] {
  const t = type.toLowerCase().trim()
  if (t.startsWith('bug')) return ['bug']
  if (t.startsWith('feat')) return ['enhancement']
  if (t.startsWith('quest')) return ['question']
  return []
}

export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { ok: false, error: 'not-configured', details: 'GITHUB_TOKEN/GITHUB_REPO must be set' }
  }
  if (!env.BOT_OWNER_ID) {
    return { ok: false, error: 'owner-unset', details: 'BOT_OWNER_ID must be set' }
  }

  const title = (input.title ?? '').trim()
  const type = (input.type ?? '').toLowerCase().trim()
  const description = (input.description ?? '').trim()
  const steps = (input.steps ?? '').trim()

  if (title.length < 5 || description.length < 10) {
    return { ok: false, error: 'missing-fields', details: 'title >= 5 chars and description >= 10 chars required' }
  }

  const labels = inferLabels(type)
  const reporterTag = input.userTag ?? input.userId

  const body = [
    description,
    steps ? `\n\n## Steps to reproduce\n${steps}` : '',
    `\n\n---\n_Reported by Discord user **${reporterTag}** (\`${input.userId}\`) via /report._`,
  ].join('')

  const sessionKey = createReportSession({
    reporterId: input.userId,
    reporterTag,
    title,
    body,
    labels,
  })

  try {
    const owner = await input.client.users.fetch(env.BOT_OWNER_ID)

    const labelLine = labels.length > 0 ? labels.join(', ') : '_none_'
    const summary = [
      `📝 **New /report from ${reporterTag}**`,
      `**Title:** ${title}`,
      `**Labels:** ${labelLine}`,
      '',
      body,
    ].join('\n')
    const truncated = summary.length > 1900 ? summary.slice(0, 1900) + '\n_…(truncated)_' : summary

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`report_approve_notice:${sessionKey}`)
        .setLabel('Approve + Notify')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`report_approve_silent:${sessionKey}`)
        .setLabel('Approve, Silent')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`report_reject_notice:${sessionKey}`)
        .setLabel('Reject + Notify')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`report_reject_silent:${sessionKey}`)
        .setLabel('Reject, Silent')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary),
    )

    await owner.send({ content: truncated, components: [row] })
  } catch (err) {
    logger.error('Failed to DM bot owner about /report:', err)
    return { ok: false, error: 'owner-dm-failed', details: (err as Error).message }
  }

  return { ok: true, sessionKey, ownerNotified: true }
}
