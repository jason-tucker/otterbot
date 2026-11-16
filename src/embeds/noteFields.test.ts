import { describe, it, expect } from 'vitest'
import { buildNoteFields, NOTE_NAME_MAX, NOTE_TOTAL_BUDGET, NOTE_VALUE_MAX } from './noteFields'

describe('buildNoteFields', () => {
  it('keeps every field within Discord limits and the whole set within the budget (13 x 2000-char notes)', () => {
    const inputs = Array.from({ length: 13 }, (_, i) => ({ name: `Author ${i} `.repeat(80), value: '*'.repeat(2000) }))
    const { fields, omitted } = buildNoteFields(inputs)
    let total = 0
    for (const f of fields) {
      expect(f.name.length).toBeLessThanOrEqual(NOTE_NAME_MAX)
      expect(f.value.length).toBeLessThanOrEqual(NOTE_VALUE_MAX)
      total += f.name.length + f.value.length
    }
    expect(total).toBeLessThanOrEqual(NOTE_TOTAL_BUDGET)
    expect(fields.length + omitted).toBe(13)
    expect(omitted).toBeGreaterThan(0)
  })

  it('escapes markdown after truncating and never ends on a dangling backslash', () => {
    const { fields } = buildNoteFields([{ name: 'n', value: '_'.repeat(3000) }])
    expect(fields[0].value.length).toBeLessThanOrEqual(NOTE_VALUE_MAX)
    expect(fields[0].value.endsWith('…')).toBe(true)
    const body = fields[0].value.slice(0, -1)
    // Every backslash in the body must be an escape for a following "_".
    expect(body.replace(/\\_/g, '')).toBe('')
  })

  it('shows short notes untouched and empty notes as a placeholder', () => {
    const { fields, omitted } = buildNoteFields([
      { name: 'a', value: 'hello' },
      { name: 'b', value: '' },
    ])
    expect(omitted).toBe(0)
    expect(fields.map((f) => f.value)).toEqual(['hello', '*(empty)*'])
  })
})
