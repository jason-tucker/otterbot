import { describe, it, expect, vi, beforeEach } from 'vitest'

const svc = vi.hoisted(() => ({ submitReport: vi.fn() }))
vi.mock('../registry', () => ({ registerVerb: vi.fn() }))
vi.mock('../../reportRequestService', () => ({ submitReport: svc.submitReport }))

import { reportSubmitHandler } from './report'

const params = (userId: string) => ({ userId, title: 'A title', type: 'bug', description: 'A long enough description' })
const ctx = { client: {}, requestId: 'r', ts: Date.now() } as never

beforeEach(() => vi.clearAllMocks())

describe('report.submit error replies', () => {
  it('passes the service result through without leaking err.message', async () => {
    // The service no longer puts err.message into details for these paths.
    svc.submitReport.mockResolvedValueOnce({ ok: false, error: 'owner-dm-failed' })
    const res = await reportSubmitHandler(params('300000000000000001'), ctx)
    expect(res).toEqual({ ok: false, error: 'owner-dm-failed', details: undefined })
  })
})
