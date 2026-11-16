import { PermissionFlagsBits } from 'discord.js'
import { describe, it, expect } from 'vitest'
import { checkMappableRole, isUniqueViolation, parseSlug, parseBusinessName } from './validators'

const GUILD = '111111111111111111'
const ROLE = '222222222222222222'

describe('checkMappableRole', () => {
  it('refuses @everyone (role id equals guild id)', () => {
    expect(checkMappableRole(GUILD, GUILD, null, 5)).toMatch(/everyone/)
  })
  it('refuses managed roles', () => {
    expect(checkMappableRole(ROLE, GUILD, { managed: true }, 5)).toMatch(/Managed/)
  })
  it('refuses a role that could not be fetched', () => {
    expect(checkMappableRole(ROLE, GUILD, null, 5)).toMatch(/not be found/)
  })
  it('refuses roles at or above the bot highest role', () => {
    expect(checkMappableRole(ROLE, GUILD, { managed: false, position: 5, permissions: { has: () => false } }, 5)).toMatch(/highest/)
    expect(checkMappableRole(ROLE, GUILD, { managed: false, position: 6, permissions: { has: () => false } }, 5)).toMatch(/highest/)
    expect(checkMappableRole(ROLE, GUILD, { managed: false, position: 4, permissions: { has: () => false } }, 5)).toBeNull()
  })
  it('refuses dangerous permissions', () => {
    const flags = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.ManageGuildExpressions,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
    ]
    for (const flag of flags) {
      const role = { managed: false, position: 1, permissions: { has: (p: bigint) => p === flag } }
      expect(checkMappableRole(ROLE, GUILD, role, 5)).toMatch(/permissions/)
    }
  })
  it('refuses Manage Channels and Manage Webhooks roles', () => {
    for (const flag of [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks]) {
      const role = { managed: false, position: 1, permissions: { has: (p: bigint) => p === flag } }
      expect(checkMappableRole(ROLE, GUILD, role, 5)).toMatch(/permissions/)
    }
  })
  it('fails closed when the bot highest role position is unknown', () => {
    const role = { managed: false, position: 1, permissions: { has: () => false } }
    expect(checkMappableRole(ROLE, GUILD, role, null)).toMatch(/Could not verify/)
  })
  it('accepts a normal role', () => {
    const role = { managed: false, position: 1, permissions: { has: () => false } }
    expect(checkMappableRole(ROLE, GUILD, role, 5)).toBeNull()
  })
})

describe('portal edit validation helpers', () => {
  it('rejects bad slugs and empty/overlong names', () => {
    expect(parseSlug('Bad Slug')).toBeNull()
    expect(parseSlug('1abc')).toBeNull()
    expect(parseSlug('good-slug')).toBe('good-slug')
    expect(parseBusinessName('   ')).toBeNull()
    expect(parseBusinessName('x'.repeat(101))).toBeNull()
  })
  it('detects unique violations', () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(true)
    expect(isUniqueViolation(new Error('connection reset'))).toBe(false)
  })
  it('detects a unique violation wrapped in a DrizzleQueryError cause', () => {
    const byCode = Object.assign(new Error('Failed query: insert into ...'), {
      cause: Object.assign(new Error('x'), { code: '23505' }),
    })
    expect(isUniqueViolation(byCode)).toBe(true)
    const byMessage = Object.assign(new Error('Failed query'), { cause: new Error('duplicate key value') })
    expect(isUniqueViolation(byMessage)).toBe(true)
    const existsInCause = Object.assign(new Error('Failed query'), { cause: new Error('relation already exists') })
    expect(isUniqueViolation(existsInCause)).toBe(true)
  })
  it('ignores "already exists" in the top-level query message (it carries params)', () => {
    const err = Object.assign(new Error('Failed query: update businesses set name = $1\nparams: already exists'), {
      cause: Object.assign(new Error('connection reset'), { code: '08006' }),
    })
    expect(isUniqueViolation(err)).toBe(false)
    expect(isUniqueViolation(new Error('params: already exists'))).toBe(false)
  })
})
