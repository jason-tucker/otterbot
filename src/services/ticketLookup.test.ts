import { describe, it, expect, vi } from 'vitest'

// A plain holder function (not a vi.fn): vitest's spy tracking flags a rejected
// vi.fn result as an unhandled rejection even when the caller handles it.
const h = vi.hoisted(() => ({ impl: (async () => undefined) as (...a: unknown[]) => Promise<unknown> }))
const get = (v: unknown) => {
  h.impl = async () => v
}
vi.mock('../config/env', () => ({ env: {} }))
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('./mkeGateway', () => ({ mkeGetJson: (...a: unknown[]) => h.impl(...a) }))

import { fetchCharacters, MkeUnavailableError } from './ticketLookup'

const profile = { id: 'c1', status: true, name: 'A B', csn: '123', dob: null, phoneNumber: '555', bankNumber: '' }

describe('fetchCharacters', () => {

  it('maps active characters', async () => {
    get({ ok: true, status: 200, data: [profile, { ...profile, id: 'c2', status: false }] })
    expect(await fetchCharacters('1')).toEqual([
      { id: 'c1', name: 'A B', csn: '123', phoneNumber: '555', bankNumber: null },
    ])
  })

  it('treats 404 as "no characters"', async () => {
    get({ ok: false, status: 404, data: null })
    expect(await fetchCharacters('1')).toEqual([])
  })

  it.each([500, 502, 503, 401, 429])('throws MkeUnavailableError on HTTP %i', async (status) => {
    get({ ok: false, status, data: null })
    const err = await fetchCharacters('1').catch((e) => e)
    expect(err).toBeInstanceOf(MkeUnavailableError)
    expect(err.status).toBe(status)
  })

  it('returns [] for an invalid 2xx payload', async () => {
    get({ ok: true, status: 200, data: null })
    expect(await fetchCharacters('1')).toEqual([])
  })

  it('lets network errors reject unchanged', async () => {
    h.impl = async () => {
      throw new Error('timeout')
    }
    let caught: unknown = null
    try {
      await fetchCharacters('1')
    } catch (e) {
      caught = e
    }
    expect((caught as Error).message).toBe('timeout')
  })
})
