import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCK_TIMEOUT_MS, describeError, maskUrlCredentials, parseLockTimeout } from './migrateUtils'

describe('parseLockTimeout', () => {
  it('uses a finite positive number', () => {
    expect(parseLockTimeout('5000')).toBe(5000)
  })
  it('falls back to 60000 for unset, empty, NaN, zero, negative or infinite values', () => {
    for (const v of [undefined, '', '  ', 'abc', 'NaN', '0', '-5', 'Infinity']) {
      expect(parseLockTimeout(v), String(v)).toBe(DEFAULT_LOCK_TIMEOUT_MS)
    }
    expect(DEFAULT_LOCK_TIMEOUT_MS).toBe(60_000)
  })
})

describe('error logging never leaks DATABASE_URL credentials', () => {
  const password = 'S3cr3tP@ssw0rd-xyz'
  const badUrls = [
    `postgres://dbuser:${password}@db:notaport/otterbot`,
    `postgresql://dbuser:${password}@[bad host/otterbot`,
    `not a url ${password}`,
  ]

  it('masks credentials from errors thrown by postgres() for a malformed URL', () => {
    for (const url of badUrls) {
      let logged = ''
      try {
        postgres(url, { max: 1 }).end({ timeout: 0 }).catch(() => {})
      } catch (err) {
        logged = describeError(err, url)
      }
      // Whether or not postgres-js throws for this input, nothing logged may contain the password.
      expect(logged).not.toContain(password)
    }
  })

  it('prints only code and message, never the error object fields', () => {
    const err = Object.assign(new TypeError(`Invalid URL ${badUrls[0]}`), {
      code: 'ERR_INVALID_URL',
      input: badUrls[0],
    })
    const out = describeError(err, badUrls[0])
    expect(out).toBe('ERR_INVALID_URL: Invalid URL <DATABASE_URL>')
    expect(out).not.toContain(password)
    expect(out).not.toContain('input')
  })

  it('masks userinfo in URLs embedded in messages even without the exact URL', () => {
    expect(maskUrlCredentials(`connect failed postgres://u:${password}@h:5432/d`)).toBe(
      'connect failed postgres://***@h:5432/d',
    )
  })

  it('handles non-Error throwables', () => {
    expect(describeError('boom')).toBe('boom')
    expect(describeError(undefined)).toBe('undefined')
  })
})
