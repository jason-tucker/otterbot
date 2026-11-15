import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  order: [] as string[],
  count: 0,
  inserted: [] as unknown[],
}))

vi.mock('../config/env', () => ({ env: {} }))
vi.mock('../db/client', () => {
  const tx = {
    execute: vi.fn(async () => {
      h.order.push('lock')
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          h.order.push('count')
          return [{ n: h.count }]
        },
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          h.order.push('insert')
          h.inserted.push(v)
          return [
            {
              id: 'b1',
              businessId: 'biz-1',
              type: 'link',
              label: 'L',
              emoji: null,
              style: 'primary',
              url: 'https://x.test',
              body: null,
              sortOrder: 1,
              enabled: true,
            },
          ]
        },
      }),
    }),
  }
  return { db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

import { addButton, MAX_BUTTONS_PER_BUSINESS } from './businessButtonsService'

beforeEach(() => {
  h.order = []
  h.inserted = []
  h.count = 0
})

describe('addButton (C12)', () => {
  it('takes the advisory lock, then counts, then inserts, in one transaction', async () => {
    const res = await addButton('biz-1', { type: 'link', label: 'L', url: 'https://x.test' }, 'u1')
    expect(res.ok).toBe(true)
    expect(h.order).toEqual(['lock', 'count', 'insert'])
  })

  it('does not insert at the cap', async () => {
    h.count = MAX_BUTTONS_PER_BUSINESS
    const res = await addButton('biz-1', { type: 'link', label: 'L', url: 'https://x.test' }, 'u1')
    expect(res).toEqual({ ok: false, error: 'limit-reached' })
    expect(h.order).toEqual(['lock', 'count'])
    expect(h.inserted).toHaveLength(0)
  })
})
