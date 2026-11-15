import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { hmacSha256, signRpcReply, timingSafeCompare } from './hmac'

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

/**
 * Independent re-implementation of the panel's reply check (botpanel
 * web/src/lib/botrpcReply.ts verifyReply): strip ts/hmac, re-stringify, compare.
 */
function panelVerify(parsed: Record<string, unknown>, secret: string, requestId: string, now = Date.now()): boolean {
  const { ts, hmac, ...rest } = parsed
  if (typeof hmac !== 'string' || typeof ts !== 'number' || !Number.isFinite(ts)) return false
  const expected = createHmac('sha256', secret)
    .update(`res.${requestId}|${requestId}|${ts}|${JSON.stringify(rest)}`)
    .digest('hex')
  if (hmac.length !== expected.length || !timingSafeCompare(hmac, expected)) return false
  return Math.abs(now - ts) <= 30_000
}

describe('signRpcReply', () => {
  const secret = 's3cret'
  const id = 'req-123'
  const wire = (r: Record<string, unknown>) => JSON.parse(JSON.stringify(r)) as Record<string, unknown>

  it('signs ok, error and unknown-verb replies that the panel check accepts', () => {
    for (const r of [
      { ok: true, data: { a: 1, nested: { b: [1, 2, { c: null }] } } },
      { ok: false, error: 'handler-threw' },
      { ok: false, error: 'unknown-verb' },
      { ok: false, error: 'x', details: { field: 'y' } },
    ]) {
      expect(panelVerify(wire(signRpcReply(secret, id, r)), secret, id)).toBe(true)
    }
  })

  it('survives undefined fields, integer-like keys and Dates', () => {
    const r = { ok: true, data: { z: 1, '10': 'a', '2': 'b', gone: undefined, when: new Date(0), n: NaN } }
    expect(panelVerify(wire(signRpcReply(secret, id, r)), secret, id)).toBe(true)
  })

  it('fails on tampered data, wrong requestId and wrong secret', () => {
    const p = wire(signRpcReply(secret, id, { ok: true, data: { n: 1 } }))
    expect(panelVerify({ ...p, data: { n: 2 } }, secret, id)).toBe(false)
    expect(panelVerify(p, secret, 'other')).toBe(false)
    expect(panelVerify(p, 'wrong', id)).toBe(false)
    expect(panelVerify(p, secret, id)).toBe(true)
  })

  it('rejects a stale ts', () => {
    const p = wire(signRpcReply(secret, id, { ok: true }, Date.now() - 60_000))
    expect(panelVerify(p, secret, id)).toBe(false)
  })

  it('never lets a result smuggle its own ts/hmac; non-objects become a signed error', () => {
    for (const bad of [{ ok: true, ts: 1 }, { ok: true, hmac: 'x' }, null, [1], 'str', undefined, { ok: 1n }]) {
      const p = wire(signRpcReply(secret, id, bad))
      expect(p.error).toBe('bad-reply-shape')
      expect(typeof p.ts).toBe('number')
      expect(panelVerify(p, secret, id)).toBe(true)
    }
  })
})
