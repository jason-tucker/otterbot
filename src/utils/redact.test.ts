import { describe, it, expect } from 'vitest'
import { redactUrlCredentials } from './redact'

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
})
