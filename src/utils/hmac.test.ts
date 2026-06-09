import { describe, it, expect } from 'vitest'
import { hmacSha256, timingSafeCompare } from './hmac'

/**
 * Regression tests for the RPC command-bus trust boundary. The HMAC verify +
 * constant-time compare is the only thing standing between an attacker who can
 * publish to the shared Redis bus and the bot's privileged verbs, and it had
 * zero test coverage. These lock in: deterministic signing, empty-secret
 * fail-closed, and that tampering any field of the canonical preimage breaks
 * verification.
 */

describe('hmacSha256', () => {
  it('is deterministic and 64 lowercase hex chars', () => {
    const a = hmacSha256('secret', 'message')
    const b = hmacSha256('secret', 'message')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes with the secret and with the message', () => {
    expect(hmacSha256('secret-1', 'm')).not.toBe(hmacSha256('secret-2', 'm'))
    expect(hmacSha256('secret', 'm1')).not.toBe(hmacSha256('secret', 'm2'))
  })

  it('returns empty string for a falsy secret (fail-closed)', () => {
    expect(hmacSha256('', 'message')).toBe('')
  })
})

describe('timingSafeCompare', () => {
  it('returns true only for identical strings', () => {
    const h = hmacSha256('s', 'm')
    expect(timingSafeCompare(h, h)).toBe(true)
    expect(timingSafeCompare(h, hmacSha256('s', 'other'))).toBe(false)
  })

  it('fails closed on length mismatch, empty, and non-strings', () => {
    expect(timingSafeCompare('abc', 'abcd')).toBe(false)
    expect(timingSafeCompare('', '')).toBe(false)
    // @ts-expect-error testing non-string inputs
    expect(timingSafeCompare(null, 'abc')).toBe(false)
    // @ts-expect-error testing non-string inputs
    expect(timingSafeCompare('abc', undefined)).toBe(false)
  })
})

describe('canonical envelope signing (matches rpcServer preimage)', () => {
  const secret = 'test-rpc-secret'
  const sign = (channel: string, requestId: string, ts: number, params: unknown) =>
    hmacSha256(secret, `${channel}|${requestId}|${ts}|${JSON.stringify(params)}`)

  it('verifies a well-formed envelope and rejects any tampered field', () => {
    const channel = 'cmd.otter.employee.promote'
    const requestId = 'req-1'
    const ts = 1_700_000_000_000
    const params = { businessSlug: 'mckenzie', userId: '123456789012345678', rank: 'owner' }

    const good = sign(channel, requestId, ts, params)
    expect(timingSafeCompare(sign(channel, requestId, ts, params), good)).toBe(true)

    // Tampering any single field must invalidate the signature.
    expect(timingSafeCompare(sign('cmd.otter.employee.fire', requestId, ts, params), good)).toBe(false)
    expect(timingSafeCompare(sign(channel, 'req-2', ts, params), good)).toBe(false)
    expect(timingSafeCompare(sign(channel, requestId, ts + 1, params), good)).toBe(false)
    expect(timingSafeCompare(sign(channel, requestId, ts, { ...params, rank: 'employee' }), good)).toBe(false)

    // Wrong secret never verifies.
    const wrongSecret = hmacSha256('not-the-secret', `${channel}|${requestId}|${ts}|${JSON.stringify(params)}`)
    expect(timingSafeCompare(wrongSecret, good)).toBe(false)
  })
})
