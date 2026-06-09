import { describe, it, expect } from 'vitest'
import { parseHttpUrl, parseSnowflake, parseSlug, parseRank } from './validators'

/**
 * Regression tests for the input validators that guard the Discord/DB trust
 * boundary. parseHttpUrl is the javascript:/data: defense for manager-supplied
 * link-button + OC product URLs; parseSnowflake is the canonical ID check that
 * the RPC handlers now consistently use.
 */

describe('parseHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(parseHttpUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(parseHttpUrl('http://example.com')).toBe('http://example.com')
  })

  it('rejects dangerous / non-http(s) schemes', () => {
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull()
    expect(parseHttpUrl('JavaScript:alert(1)')).toBeNull()
    expect(parseHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(parseHttpUrl('ftp://example.com/file')).toBeNull()
    expect(parseHttpUrl('vbscript:msgbox')).toBeNull()
  })

  it('rejects non-URLs, empties, and over-long input', () => {
    expect(parseHttpUrl('not a url')).toBeNull()
    expect(parseHttpUrl('')).toBeNull()
    expect(parseHttpUrl(null)).toBeNull()
    expect(parseHttpUrl(123)).toBeNull()
    expect(parseHttpUrl('https://example.com/' + 'a'.repeat(600))).toBeNull()
  })
})

describe('parseSnowflake', () => {
  it('accepts 17-20 digit IDs', () => {
    expect(parseSnowflake('12345678901234567')).toBe('12345678901234567') // 17
    expect(parseSnowflake('12345678901234567890')).toBe('12345678901234567890') // 20
  })

  it('rejects out-of-range / non-numeric IDs', () => {
    expect(parseSnowflake('1234567890123456')).toBeNull() // 16
    expect(parseSnowflake('123456789012345678901')).toBeNull() // 21
    expect(parseSnowflake('12345abc901234567')).toBeNull()
    expect(parseSnowflake('')).toBeNull()
    expect(parseSnowflake(undefined)).toBeNull()
    expect(parseSnowflake(12345678901234567)).toBeNull() // number, not string
  })
})

describe('parseSlug', () => {
  it('accepts well-formed slugs and rejects bad ones', () => {
    expect(parseSlug('mckenzie')).toBe('mckenzie')
    expect(parseSlug('original-clothing')).toBe('original-clothing')
    expect(parseSlug('1bad')).toBeNull() // must start with a letter
    expect(parseSlug('Bad Slug')).toBeNull()
    expect(parseSlug('drop;table')).toBeNull()
  })
})

describe('parseRank', () => {
  it('accepts the three ranks and rejects anything else', () => {
    expect(parseRank('owner')).toBe('owner')
    expect(parseRank('manager')).toBe('manager')
    expect(parseRank('employee')).toBe('employee')
    expect(parseRank('admin')).toBeNull()
    expect(parseRank('')).toBeNull()
  })
})
