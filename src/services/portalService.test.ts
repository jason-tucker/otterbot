import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  set: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  publish: vi.fn(),
}))

vi.mock('../config/env', () => ({ env: {} }))
vi.mock('../db/client', () => {
  const where = vi.fn(() => ({ returning: h.returning, then: (r: (v: unknown) => void) => r(undefined) }))
  const set = (arg: unknown) => {
    h.set(arg)
    return { where }
  }
  return { db: { update: () => ({ set }), select: h.select } }
})
vi.mock('./eventBus', () => ({ publish: h.publish, businessCh: (n: string) => `biz.${n}` }))
vi.mock('./mckenzieBusinessCache', () => ({ invalidateKnownMckenzieBusinesses: vi.fn() }))

import { updateBusinessSettings, toggleBusinessSetting } from './portalService'

/** Flatten the static SQL text of a drizzle `sql` fragment. */
function sqlText(fragment: unknown): string {
  const chunks = (fragment as { queryChunks?: unknown[] }).queryChunks ?? []
  return chunks.flatMap((c) => (Array.isArray((c as { value?: unknown }).value) ? ((c as { value: string[] }).value) : [])).join('')
}

beforeEach(() => {
  h.set.mockReset()
  h.returning.mockReset()
  h.select.mockReset()
  h.publish.mockReset()
})

describe('updateBusinessSettings (C11)', () => {
  it('merges the patch in ONE UPDATE statement without a read-modify-write select', async () => {
    await updateBusinessSettings('biz-1', { apiEnabled: true }, 'u1')
    expect(h.select).not.toHaveBeenCalled()
    expect(h.set).toHaveBeenCalledTimes(1)
    const text = sqlText(h.set.mock.calls[0][0].settings)
    expect(text).toContain('||')
    expect(text).toContain('coalesce')
    expect(h.publish).toHaveBeenCalledTimes(1)
  })
})

describe('toggleBusinessSetting (C11)', () => {
  it('flips the flag in one UPDATE ... RETURNING and returns the stored value', async () => {
    h.returning.mockResolvedValue([{ settings: { managersCanPromote: true } }])
    const v = await toggleBusinessSetting('biz-1', 'managersCanPromote', 'u1')
    expect(v).toBe(true)
    expect(h.select).not.toHaveBeenCalled()
    expect(h.set).toHaveBeenCalledTimes(1)
    expect(sqlText(h.set.mock.calls[0][0].settings)).toContain('jsonb_set')
    expect(h.publish.mock.calls[0][1].delta).toEqual({ settings: { managersCanPromote: true } })
  })

  it('returns false when the stored flag is off or the business does not exist', async () => {
    h.returning.mockResolvedValueOnce([{ settings: { managersCanPromote: false } }])
    expect(await toggleBusinessSetting('biz-1', 'managersCanPromote', 'u1')).toBe(false)
    h.returning.mockResolvedValueOnce([])
    expect(await toggleBusinessSetting('missing', 'managersCanPromote', 'u1')).toBe(false)
  })
})
