import { describe, it, expect } from 'vitest'
import { redactUrlCredentials, stripUrlCredentialsInText, breakCodeFences } from './redact'

describe('redactUrlCredentials', () => {
  it('masks user and password', () => {
    expect(redactUrlCredentials('redis://user:secret@redis:6379/0')).toBe('redis://***@redis:6379/0')
  })
  it('masks a password-only userinfo', () => {
    const out = redactUrlCredentials('redis://:secret@redis:6379')
    expect(out).not.toContain('secret')
    expect(out).toBe('redis://***@redis:6379')
  })
  it('leaves a credential-free URL readable', () => {
    expect(redactUrlCredentials('redis://redis:6379')).toBe('redis://redis:6379')
  })
  it('returns [redacted] for unparseable input', () => {
    expect(redactUrlCredentials('not a url:pass@@')).toBe('[redacted]')
  })
  it('masks password and username query parameters', () => {
    const out = redactUrlCredentials('redis://h:6379/?password=hunter2&username=bob&db=1')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('bob')
    expect(out).toContain('db=1')
  })
  it('masks token / key / secret style query values', () => {
    const out = stripUrlCredentialsInText(
      'GET https://x/y?token=aaa&key=bbb&secret=ccc&access_token=ddd&api_key=eee&apikey=fff&page=2 failed',
    )
    for (const v of ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff']) expect(out).not.toContain(v)
    expect(out).toContain('page=2')
  })
})

describe('stripUrlCredentialsInText', () => {
  it('masks userinfo in free text', () => {
    const out = stripUrlCredentialsInText('connect postgres://u:p%40ss@db:5432/x failed')
    expect(out).toBe('connect postgres://***@db:5432/x failed')
  })
  it('masks ?password= and &username= values in free text', () => {
    const out = stripUrlCredentialsInText('failed redis://h:6379/?password=hunter2&username=bob&db=1 ok')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('bob')
    expect(out).toContain('db=1')
  })
})

describe('breakCodeFences', () => {
  it('breaks runs of backticks with a zero-width space', () => {
    const out = breakCodeFences('a ``` b')
    expect(out).not.toContain('```')
    expect(out).toContain('​')
  })
})
