import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stub the env module so importing the gateway doesn't trigger startup
// validation of real environment variables.
vi.mock('../config/env', () => ({
  env: {
    EUPHORIC_API_BASE_URL: 'https://mke.test/api',
    EUPHORIC_API_KEY: 'test-key',
  },
}))

import { mkeGetJson, invalidateMkeCacheWhere, clearMkeCache } from './mkeGateway'

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function errResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('should not read error bodies')),
  } as unknown as Response
}

describe('mkeGetJson', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    clearMkeCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('fetches with the API key header and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ id: '1' }]))
    const res = await mkeGetJson('/character-profiles/discord/123')
    expect(res).toEqual({ ok: true, status: 200, data: [{ id: '1' }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://mke.test/api/character-profiles/discord/123')
    expect(init.headers).toEqual({ 'EUPHORIC-API-KEY': 'test-key' })
  })

  it('serves a cached response within the TTL without refetching', async () => {
    fetchMock.mockResolvedValue(okResponse({ a: 1 }))
    const first = await mkeGetJson('/x')
    const second = await mkeGetJson('/x')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('refetches once the TTL has elapsed', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(okResponse({ a: 1 }))
    await mkeGetJson('/x')
    vi.advanceTimersByTime(16_000)
    await mkeGetJson('/x')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache non-OK responses', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(500)).mockResolvedValueOnce(okResponse({ ok: 1 }))
    const first = await mkeGetJson('/y')
    expect(first.ok).toBe(false)
    expect(first.status).toBe(500)
    expect(first.data).toBeNull()
    const second = await mkeGetJson('/y')
    expect(second.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache rejected fetches and propagates the error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(okResponse(1))
    await expect(mkeGetJson('/z')).rejects.toThrow('timeout')
    const second = await mkeGetJson('/z')
    expect(second.data).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dedupes identical concurrent requests into one fetch', async () => {
    let release: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve }))
    const p1 = mkeGetJson('/concurrent')
    const p2 = mkeGetJson('/concurrent')
    release(okResponse({ shared: true }))
    const [r1, r2] = await Promise.all([p1, p2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r1.data).toEqual({ shared: true })
    expect(r2).toBe(r1)
  })

  it('does not dedupe different URLs', async () => {
    fetchMock.mockResolvedValue(okResponse(1))
    await Promise.all([mkeGetJson('/a'), mkeGetJson('/b')])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('invalidateMkeCacheWhere drops matching entries only', async () => {
    fetchMock.mockResolvedValue(okResponse(1))
    await mkeGetJson('/character-profiles/csn/ABC123/markers')
    await mkeGetJson('/character-profiles/discord/999')
    fetchMock.mockClear()

    invalidateMkeCacheWhere(encodeURIComponent('ABC123'))

    await mkeGetJson('/character-profiles/csn/ABC123/markers') // refetched
    await mkeGetJson('/character-profiles/discord/999') // still cached
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('ABC123')
  })

  it('treats a malformed JSON body on a 200 as data: null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    } as unknown as Response)
    const res = await mkeGetJson('/bad-json')
    expect(res).toEqual({ ok: true, status: 200, data: null })
  })
})
