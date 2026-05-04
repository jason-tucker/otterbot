import { db } from '../db/client'
import { ocStock } from '../db/schema'
import { eq, asc } from 'drizzle-orm'

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
}

export async function updateStockUrl(id: string, url: string | null, actorDiscordId: string): Promise<void> {
  await db.update(ocStock).set({ url, updatedAt: new Date(), updatedByDiscordId: actorDiscordId }).where(eq(ocStock.id, id))
}

export async function addStockItem(name: string, actorDiscordId: string): Promise<void> {
  const all = await getAllStock()
  const maxOrder = all.length > 0 ? Math.max(...all.map((i) => i.sortOrder)) : 0
  await db.insert(ocStock).values({ name: name.trim(), status: 'in_stock', sortOrder: maxOrder + 1, updatedByDiscordId: actorDiscordId })
}

export async function removeStockItem(id: string): Promise<void> {
  await db.delete(ocStock).where(eq(ocStock.id, id))
}
