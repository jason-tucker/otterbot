import { describe, it, expect } from 'vitest'
import { buildCustomerEmbed } from './customerEmbed'
import { buildTicketCharacterEmbed } from './ticketCharacterEmbed'
import { buildBusinessEmbed } from './businessEmbed'
import type { Business, Character } from '../types/domain'

/**
 * Regression tests for markdown / link-injection escaping in embeds that render
 * external MKE-API-controlled strings (character names, CSN/phone/bank, roster
 * names). The escaper utilities are unit-tested in utils/escape.test.ts; these
 * tests assert the embed builders actually APPLY them — the gap that let a
 * crafted character name inject a phishing link into a public "Send to Channel"
 * post (customerEmbed) before this fix.
 */

// Recursively collect every string value out of a discord.js builder's JSON.
function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, acc))
  return acc
}

function renderText(components: unknown[]): string {
  return collectStrings(components.map((c) => (c as { toJSON: () => unknown }).toJSON())).join('\n')
}

const business: Business = {
  id: 'biz-1',
  name: 'McKenzie Enterprises',
  slug: 'mckenzie',
  providerType: 'mckenzie',
  guildId: '123',
  active: true,
  settings: null,
  createdAt: new Date(0),
}

function character(overrides: Partial<Character>): Character {
  return {
    id: 'char-1',
    name: 'Jane Doe',
    csn: '10001',
    dob: null,
    phoneNumber: null,
    bankNumber: null,
    discordId: null,
    securityRiskLevel: 0,
    securityRiskInfo: null,
    source: 'mckenzie_api',
    ...overrides,
  }
}

describe('customerEmbed link-injection escaping', () => {
  it('escapes a character name that tries to break out of the markdown link', () => {
    const evil = character({ name: 'Pwn](https://evil.example/phish)x' })
    const { components } = buildCustomerEmbed(evil, business, null, 'manager', null, 0, 'sess-1')
    const text = renderText(components)

    // The breakout sequence that would create a NEW link to the attacker host
    // must not survive (the legit link points at mke.euphoric.gg).
    expect(text).not.toContain('](https://evil.example')
    // Escaping must have actually happened (backslash-escaped bracket present).
    expect(text).toContain('\\]')
    // The legit, intended customer link is still produced.
    expect(text).toContain('https://mke.euphoric.gg/employee/portal/customers/view/')
  })

  it('escapes formatting characters in a standing reason', () => {
    const c = character({})
    const standing = {
      id: 's1',
      businessId: 'biz-1',
      characterId: 'char-1',
      characterName: 'Jane Doe',
      standing: 'bad' as const,
      reason: 'scam **alert** `rm -rf`',
      updatedByDiscordId: '1',
      updatedAt: new Date(0),
    }
    const { components } = buildCustomerEmbed(c, business, standing, 'manager', null, 0, 'sess-2')
    const text = renderText(components)
    expect(text).not.toContain('**alert**')
    expect(text).toContain('\\*\\*alert\\*\\*')
  })
})

describe('ticketCharacterEmbed escaping', () => {
  it('strips backticks from code-span fields and escapes the name', () => {
    const { components } = buildTicketCharacterEmbed(
      { id: 'x', name: 'Bob **boom**', csn: '999`# pwned', phoneNumber: null, bankNumber: null },
      '555000111222333444'
    )
    const text = renderText(components)
    // backtick injected into the CSN code span is stripped, not rendered raw.
    expect(text).not.toContain('999`#')
    expect(text).toContain('999# pwned')
    // name formatting is escaped.
    expect(text).not.toContain('**boom**')
    expect(text).toContain('\\*\\*boom\\*\\*')
  })
})

describe('businessEmbed roster escaping', () => {
  it('escapes roster member names and CSN code spans', () => {
    const roster = {
      businessName: 'Acme **Corp**',
      members: [
        {
          name: 'Owner](http://evil)',
          role: 'owner' as const,
          discordId: null,
          csn: '7`7',
          character: { phoneNumber: null, bankNumber: null },
        },
      ],
    }
    // buildBusinessEmbed accepts a BusinessRoster-shaped object.
    const { components } = buildBusinessEmbed(
      { name: 'Acme', providerType: 'mckenzie' },
      roster as unknown as Parameters<typeof buildBusinessEmbed>[1]
    )
    const text = renderText(components)
    expect(text).toContain('\\*\\*Corp\\*\\*')
    expect(text).not.toContain('Acme **Corp**')
    // backtick in CSN stripped
    expect(text).not.toContain('7`7')
    expect(text).toContain('77')
  })
})
