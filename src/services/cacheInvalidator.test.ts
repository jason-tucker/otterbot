import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config/env', () => ({ env: { BOTPANEL_RPC_SECRET: 'secret-secret', REDIS_URL: 'redis://x:6379' } }))
vi.mock('ioredis', () => ({ default: class {} }))
vi.mock('./businessMessagesService', () => ({ invalidateBusinessMessageCache: vi.fn() }))
vi.mock('./mckenzieBusinessCache', () => ({ invalidateKnownMckenzieBusinesses: vi.fn() }))

import { acceptInvalidate, closeCacheInvalidator, _resetInvalidatorState } from './cacheInvalidator'
import { hmacSha256 } from '../utils/hmac'

const CH = 'bot.otter.settings.invalidate'
const SECRET = 'secret-secret'
const NOW = 1_800_000_000_000

function env(ts: number, params: Record<string, unknown> = { table: 'businesses' }, secret = SECRET): string {
  return JSON.stringify({ ts, params, hmac: hmacSha256(secret, `${CH}|${ts}|${JSON.stringify(params)}`) })
}

beforeEach(() => _resetInvalidatorState())

describe('acceptInvalidate', () => {
  it('accepts a fresh envelope once, then reports duplicate', () => {
    const raw = env(NOW)
    expect(acceptInvalidate(CH, raw, SECRET, NOW)).toEqual({ ok: true, params: { table: 'businesses' } })
    expect(acceptInvalidate(CH, raw, SECRET, NOW + 1000)).toEqual({ ok: false, reason: 'duplicate' })
  })
  it.each([-31_000, 31_000])('rejects ts %i ms away as stale', (d) => {
    expect(acceptInvalidate(CH, env(NOW + d), SECRET, NOW)).toEqual({ ok: false, reason: 'stale' })
  })
  it('accepts ts 29 s in the past', () => {
    expect(acceptInvalidate(CH, env(NOW - 29_000), SECRET, NOW).ok).toBe(true)
  })
  it('rejects a bad hmac and malformed input', () => {
    expect(acceptInvalidate(CH, env(NOW, undefined, 'other'), SECRET, NOW)).toEqual({ ok: false, reason: 'hmac' })
    expect(acceptInvalidate(CH, 'not json', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' })
    expect(acceptInvalidate(CH, '{"ts":1}', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' })
  })
  it('a stale replay does not consume a dedupe slot', () => {
    const raw = env(NOW - 60_000)
    expect(acceptInvalidate(CH, raw, SECRET, NOW)).toEqual({ ok: false, reason: 'stale' })
  })
  it('evicts the oldest entry past the 1000 cap', () => {
    const first = env(NOW, { table: 't', key: 'first' })
    expect(acceptInvalidate(CH, first, SECRET, NOW).ok).toBe(true)
    for (let i = 0; i < 1000; i++) acceptInvalidate(CH, env(NOW, { table: 't', key: `k${i}` }), SECRET, NOW)
    expect(acceptInvalidate(CH, first, SECRET, NOW).ok).toBe(true)
  })
})

describe('closeCacheInvalidator', () => {
  it('is a no-op when never started, and idempotent', async () => {
    await closeCacheInvalidator()
    await closeCacheInvalidator()
  })
})
