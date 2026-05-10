import { db } from '../db/client'
import { auditLogs } from '../db/schema'

interface AuditParams {
  actorDiscordId: string
  actorName: string
  businessId?: string
  action: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
  success?: boolean
}

const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization)/i
const MAX_STRING_LENGTH = 500

function sanitizeDetails(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (input == null) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = '[REDACTED]'
      continue
    }
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      out[key] = value.slice(0, MAX_STRING_LENGTH) + '…'
      continue
    }
    out[key] = value
  }
  return out
}

export async function audit(params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    actorDiscordId: params.actorDiscordId,
    actorName: params.actorName,
    businessId: params.businessId ?? null,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    details: sanitizeDetails(params.details),
    success: params.success ?? true,
  })
}
