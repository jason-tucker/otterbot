import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = vi.hoisted(() => new Map<string, (p: unknown, ctx: unknown) => Promise<unknown>>())
const svc = vi.hoisted(() => ({
  upsertBusinessMessage: vi.fn(),
  deleteBusinessMessage: vi.fn(),
}))

vi.mock('../registry', () => ({
  registerVerb: (n: string, h: (p: unknown, ctx: unknown) => Promise<unknown>) => handlers.set(n, h),
}))
vi.mock('../../../config/env', () => ({ env: { BOT_OWNER_ID: '200000000000000001' } }))
vi.mock('../../../db/client', () => ({ db: {} }))
vi.mock('../../businessMessagesService', () => ({
  getEditableKeysForSlug: () => ({ 'caked.contact': { label: 'Contact', body: 'x' } }),
  listBusinessMessages: vi.fn(),
  upsertBusinessMessage: svc.upsertBusinessMessage,
  deleteBusinessMessage: svc.deleteBusinessMessage,
}))

import './business_messages'

const base = { businessSlug: 'caked-up', actorUserId: '200000000000000001' }
const ctx = { client: {}, requestId: 'r1', ts: Date.now() }

beforeEach(() => vi.clearAllMocks())

describe.each(['business_messages.update', 'business_messages.reset'])('%s key allowlist', (verb) => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'rejects inherited Object.prototype key %s without writing',
    async (messageKey) => {
      const res = await handlers.get(verb)!({ ...base, messageKey, body: 'hello' }, ctx)
      expect(res).toEqual({ ok: false, error: 'unknown-key' })
      expect(svc.upsertBusinessMessage).not.toHaveBeenCalled()
      expect(svc.deleteBusinessMessage).not.toHaveBeenCalled()
    },
  )
})
