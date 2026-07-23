import { describe, it, expect, vi } from 'vitest'

// Stub modules that pull in the env-validating db client / dotenv at import time.
vi.mock('../db/client', () => ({ db: {} }))
vi.mock('../config/env', () => ({ env: { sudoRoleIds: [] } }))

import { buildOCPublicContainer, buildOCManageEmbed } from './ocEmbed'
import type { OcStockItem } from '../services/ocStockService'

/**
 * Regression tests for the Discord Components-V2 4000-character total-text
 * limit. The public /oc card renders every stock item as a markdown product
 * link; once the list grew past ~28 items the assembled payload exceeded the
 * cap, Discord rejected the editReply with error 50035, and users saw the
 * generic "An unexpected error occurred." The builders only validate the
 * per-component limit locally, so these tests assert the *total* stays under
 * budget (with headroom for the appended panel-link line).
 */

const LONG_URL =
  'https://ruubzz.wixsite.com/mysite/product-page/streetwear-piece-limited-edition-drop-extended-slug'

function fakeItems(n: number, withUrl = true): OcStockItem[] {
  const statuses = ['in_stock', 'low_stock', 'out_of_stock'] as const
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    name: `Streetwear Piece Number ${i} Limited`,
    status: statuses[i % 3],
    sortOrder: i,
    url: withUrl ? `${LONG_URL}-${i}` : null,
  }))
}

// Sum the text-display content of a serialized container — what Discord
// counts against the 4000-char CV2 message limit.
function totalTextChars(json: unknown): number {
  let sum = 0
  const walk = (c: unknown): void => {
    if (!c || typeof c !== 'object') return
    const rec = c as { content?: unknown; components?: unknown[] }
    if (typeof rec.content === 'string') sum += rec.content.length
    if (Array.isArray(rec.components)) rec.components.forEach(walk)
  }
  walk(json)
  return sum
}

function renderedText(json: unknown): string {
  const acc: string[] = []
  const walk = (c: unknown): void => {
    if (!c || typeof c !== 'object') return
    const rec = c as { content?: unknown; components?: unknown[] }
    if (typeof rec.content === 'string') acc.push(rec.content)
    if (Array.isArray(rec.components)) rec.components.forEach(walk)
  }
  walk(json)
  return acc.join('\n')
}

describe('buildOCPublicContainer — CV2 4000-char total-text budget', () => {
  it('keeps product links for a small stock list', () => {
    const json = buildOCPublicContainer(fakeItems(10)).toJSON()
    const text = renderedText(json)
    expect(text).toContain(`](${LONG_URL}-0)`)
    expect(totalTextChars(json)).toBeLessThanOrEqual(3800)
  })

  it('stays under budget for a large stock list with long URLs', () => {
    const json = buildOCPublicContainer(fakeItems(60)).toJSON()
    expect(totalTextChars(json)).toBeLessThanOrEqual(3800)
  })

  it('falls back to plain names (all items still listed) rather than dropping items', () => {
    const items = fakeItems(60)
    const json = buildOCPublicContainer(items).toJSON()
    const text = renderedText(json)
    // No markdown product links in fallback mode…
    expect(text).not.toContain(LONG_URL)
    // …but every item name still renders.
    for (const item of items) expect(text).toContain(item.name)
    expect(text).toContain('Browse our full shop')
  })

  it('truncates with a "+N more" note in the extreme case', () => {
    const json = buildOCPublicContainer(fakeItems(300)).toJSON()
    expect(totalTextChars(json)).toBeLessThanOrEqual(3800)
    expect(renderedText(json)).toMatch(/plus \d+ more item/)
  })

  it('renders the empty stock list unchanged', () => {
    const json = buildOCPublicContainer([]).toJSON()
    const text = renderedText(json)
    expect(text).toContain('Original Clothing')
    expect(text).toContain('Stock Key')
    expect(totalTextChars(json)).toBeLessThanOrEqual(3800)
  })
})

describe('buildOCManageEmbed — name lists clamped', () => {
  it('stays under the CV2 total-text cap with a huge inventory', () => {
    const { components } = buildOCManageEmbed(fakeItems(300, false))
    const container = (components[0] as { toJSON: () => unknown }).toJSON()
    expect(totalTextChars(container)).toBeLessThanOrEqual(3800)
  })

  it('lists names normally for a small inventory', () => {
    const items = fakeItems(6, false)
    const { components } = buildOCManageEmbed(items)
    const container = (components[0] as { toJSON: () => unknown }).toJSON()
    const text = renderedText(container)
    for (const item of items) expect(text).toContain(item.name)
    expect(text).not.toContain('more')
  })
})
