import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ createReportSession: vi.fn() }))
vi.mock('../config/env', () => ({
  env: { GITHUB_TOKEN: 'ghp_x', GITHUB_REPO: 'o/r', BOT_OWNER_ID: '200000000000000001' },
}))
vi.mock('./reportCache', () => ({ createReportSession: m.createReportSession }))

import { submitReport } from './reportRequestService'

const base = {
  userId: '300000000000000001',
  title: 'A title',
  type: 'bug',
  description: 'A long enough description',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('submitReport failure replies', () => {
  it('unknown (session persist failure) carries no details', async () => {
    m.createReportSession.mockRejectedValueOnce(new Error('connection string postgres://u:pw@db leaked'))
    const res = await submitReport({ ...base, client: {} as never })
    expect(res).toEqual({ ok: false, error: 'unknown' })
  })
  it('owner-dm-failed carries no details', async () => {
    m.createReportSession.mockResolvedValueOnce('key')
    const client = { users: { fetch: vi.fn().mockRejectedValue(new Error('Missing Access secret-ish')) } }
    const res = await submitReport({ ...base, client: client as never })
    expect(res).toEqual({ ok: false, error: 'owner-dm-failed' })
  })
})
