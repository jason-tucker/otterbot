import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ order: [] as string[] }))

vi.mock('../config/env', () => ({ env: {} }))
vi.mock('../db/client', () => {
  const tx = {
    execute: vi.fn(async () => {
      h.order.push('lock')
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          h.order.push('insert')
          return [{ id: 'item-1' }]
        },
      }),
    }),
  }
  return { db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})
vi.mock('./eventBus', () => ({ publish: vi.fn(), ocStockCh: (n: string) => n }))

import { addStockItem } from './ocStockService'

beforeEach(() => {
  h.order = []
})

describe('addStockItem (C12)', () => {
  it('serialises adds with an advisory lock before the insert', async () => {
    await addStockItem('Hoodie', 'u1')
    expect(h.order).toEqual(['lock', 'insert'])
  })
})
