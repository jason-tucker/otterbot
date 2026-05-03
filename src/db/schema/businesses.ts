import { pgTable, uuid, text, boolean, jsonb, timestamp, unique } from 'drizzle-orm/pg-core'

export const businesses = pgTable('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  providerType: text('provider_type').$type<'mckenzie' | 'discord-only'>().notNull(),
  guildId: text('guild_id').notNull(),
  active: boolean('active').notNull().default(true),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const businessRoleMappings = pgTable('business_role_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  guildId: text('guild_id').notNull(),
  roleId: text('role_id').notNull(),
  rank: text('rank').$type<'employee' | 'manager' | 'owner'>().notNull(),
}, (table) => [
  unique('uq_role_per_guild').on(table.guildId, table.roleId),
])
