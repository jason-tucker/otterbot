import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { businesses } from './businesses'

export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  characterId: text('character_id').notNull(),
  characterName: text('character_name').notNull(),
  content: text('content').notNull(),
  authorDiscordId: text('author_discord_id').notNull(),
  authorName: text('author_name').notNull(),
  visibility: text('visibility').$type<'staff' | 'manager' | 'owner'>().notNull().default('staff'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
