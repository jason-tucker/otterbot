import { safeMarkdown } from '../utils/escape'

/**
 * Pure builder for the View Notes embed fields. Discord rejects an embed whose
 * fields exceed 256 (name) / 1024 (value) chars each or 6000 chars in total
 * (title + footer + fields), and notes are free text up to ~2000 chars, so the
 * builder truncates each note and stops adding fields before the running total
 * passes the budget. The caller shows `omitted` in the footer.
 */
export const NOTE_NAME_MAX = 256
export const NOTE_VALUE_MAX = 1024
/** Field-text budget; leaves ~500 chars for the title + footer inside 6000. */
export const NOTE_TOTAL_BUDGET = 5500

export interface NoteFieldInput {
  /** Already-safe heading text (caller escapes any user-controlled parts). */
  name: string
  /** Raw note body — escaped here, after truncation. */
  value: string
}

export interface BuiltNoteFields {
  fields: { name: string; value: string; inline: false }[]
  omitted: number
}

function hardCap(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  // Don't leave a dangling escape backslash right before the ellipsis.
  const trailing = /\\+$/.exec(cut)
  if (trailing && trailing[0].length % 2 === 1) cut = cut.slice(0, -1)
  return `${cut}…`
}

export function buildNoteFields(inputs: NoteFieldInput[]): BuiltNoteFields {
  const fields: BuiltNoteFields['fields'] = []
  let total = 0
  let i = 0
  for (; i < inputs.length; i++) {
    const name = hardCap(inputs[i].name || '​', NOTE_NAME_MAX)
    const raw = inputs[i].value
    // Truncate the raw text first, then escape, then hard-cap: escaping can
    // roughly double the length of a note full of markdown characters.
    const truncated = raw.length > NOTE_VALUE_MAX ? `${raw.slice(0, NOTE_VALUE_MAX)}…` : raw
    const value = raw ? hardCap(safeMarkdown(truncated), NOTE_VALUE_MAX) : '*(empty)*'
    if (total + name.length + value.length > NOTE_TOTAL_BUDGET) break
    total += name.length + value.length
    fields.push({ name, value, inline: false })
  }
  return { fields, omitted: inputs.length - i }
}
