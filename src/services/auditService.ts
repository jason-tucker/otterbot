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

export async function audit(params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    actorDiscordId: params.actorDiscordId,
    actorName: params.actorName,
    businessId: params.businessId ?? null,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    details: params.details ?? null,
    success: params.success ?? true,
  })
}
