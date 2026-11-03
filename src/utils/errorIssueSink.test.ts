import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetIssueSink, fingerprint, reportErrorToIssue } from './errorIssueSink'

const cfg = { token: 'tok', repo: 'o/r', redact: (s: string) => s.split('SECRET').join('[R]') }
const input = (context = 'cmd=oc step=x user=111 guild=222', message = 'boom SECRET') => ({
  context,
  message,
  stack: 'Error: boom\n    at x',
})

type Call = { url: string; method: string; body?: any }

function mockFetch(responses: Array<{ ok: boolean; json?: unknown; status?: number }>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init: any) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined })
    const r = responses.shift() ?? { ok: true, json: {} }
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.json } as Response
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

describe('errorIssueSink', () => {
  beforeEach(() => _resetIssueSink())
  afterEach(() => vi.unstubAllGlobals())

  it('fingerprint ignores user/guild IDs', () => {
    expect(fingerprint('cmd=oc user=111 guild=222', 'x')).toBe(fingerprint('cmd=oc user=999 guild=888', 'x'))
    expect(fingerprint('cmd=oc', 'x')).not.toBe(fingerprint('cmd=caked', 'x'))
  })

  it('creates a new issue when none is open, and redacts secrets', async () => {
    const calls = mockFetch([{ ok: true, json: [] }, { ok: true, json: { number: 7 } }])
    await reportErrorToIssue(cfg, input())
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect(calls[1].url).toBe('https://api.github.com/repos/o/r/issues')
    expect(calls[1].body.title).toContain(`[err:${fingerprint(input().context, input().message)}]`)
    expect(calls[1].body.title).not.toContain('111')
    expect(JSON.stringify(calls[1].body)).not.toContain('SECRET')
  })

  it('comments on an existing open issue with the same fingerprint', async () => {
    const fp = fingerprint(input().context, input().message)
    const calls = mockFetch([
      { ok: true, json: [{ number: 5, title: `[auto-error] x [err:${fp}]` }] },
      { ok: true, json: {} },
    ])
    await reportErrorToIssue(cfg, input())
    expect(calls[1].url).toBe('https://api.github.com/repos/o/r/issues/5/comments')
  })

  it('does not post twice for the same error inside the window', async () => {
    const calls = mockFetch([{ ok: true, json: [] }, { ok: true, json: { number: 7 } }])
    await reportErrorToIssue(cfg, input())
    await reportErrorToIssue(cfg, input('cmd=oc step=x user=333 guild=222'))
    expect(calls).toHaveLength(2)
  })

  it('never throws when GitHub fails', async () => {
    mockFetch([{ ok: false, status: 403 }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(reportErrorToIssue(cfg, input())).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
