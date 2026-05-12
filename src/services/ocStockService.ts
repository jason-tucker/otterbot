import { db } from '../db/client'
import { ocStock } from '../db/schema'
import { eq, asc, sql } from 'drizzle-orm'
import { publish, ocStockCh } from './eventBus'

export type OcStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface OcStockItem {
  id: string
  name: string
  status: OcStockStatus
  sortOrder: number
  url: string | null
}

export async function getAllStock(): Promise<OcStockItem[]> {
  const rows = await db.select().from(ocStock).orderBy(asc(ocStock.sortOrder), asc(ocStock.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as OcStockStatus,
    sortOrder: r.sortOrder,
    url: r.url ?? null,
  }))
}

export async function getStockById(id: string): Promise<OcStockItem | null> {
  const rows = await db.select().from(ocStock).where(eq(ocStock.id, id)).limit(1)
  if (!rows[0]) return null
  return { id: rows[0].id, name: rows[0].name, status: rows[0].status as OcStockStatus, sortOrder: rows[0].sortOrder, url: rows[0].url ?? null }
}

export async function updateStockStatus(id: string, status: OcStockStatus, actorDiscordId: string): Promise<void> {
  await db.update(ocStock).set({ status, updatedAt: new Date(), updatedByDiscordId: actorDiscordId }).where(eq(ocStock.id, id))
  void publish(ocStockCh('item_status'), {
    itemId: id,
    status,
    by: actorDiscordId,
    ts: new Date().toISOString(),
  })
}

export async function updateStockUrl(id: string, url: string | null, actorDiscordId: string): Promise<void> {
  await db.update(ocStock).set({ url, updatedAt: new Date(), updatedByDiscordId: actorDiscordId }).where(eq(ocStock.id, id))
  void publish(ocStockCh('item_url'), {
    itemId: id,
    by: actorDiscordId,
    ts: new Date().toISOString(),
    delta: { url },
  })
}

export async function addStockItem(name: string, actorDiscordId: string): Promise<void> {
  // Derive next sortOrder atomically inside the INSERT so two concurrent adds
  // can't both read the same MAX and produce duplicate sort orders. COALESCE
  // handles the empty-table case.
  const rows = await db.insert(ocStock).values({
    name: name.trim(),
    status: 'in_stock',
    sortOrder: sql<number>`COALESCE((SELECT MAX(${ocStock.sortOrder}) FROM ${ocStock}), 0) + 1`,
    updatedByDiscordId: actorDiscordId,
  }).returning({ id: ocStock.id })
  const itemId = rows[0]?.id
  if (itemId) {
    void publish(ocStockCh('item_added'), {
      itemId,
      status: 'in_stock',
      by: actorDiscordId,
      ts: new Date().toISOString(),
      delta: { name: name.trim() },
    })
  }
}

export async function removeStockItem(id: string, actorDiscordId: string): Promise<void> {
  await db.delete(ocStock).where(eq(ocStock.id, id))
  void publish(ocStockCh('item_removed'), {
    itemId: id,
    by: actorDiscordId,
    ts: new Date().toISOString(),
  })
}
