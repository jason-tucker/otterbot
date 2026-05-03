import { pgTable, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorDiscordId: text('actor_discord_id').notNull(),
  actorName: text('actor_name').notNull(),
  businessId: text('business_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  success: boolean('success').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
