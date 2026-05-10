import { describe, it, expect } from 'vitest'
import {
  markerTypeLabel,
  markerTypeEmoji,
  MARKER_TYPE_NOTE,
  MARKER_TYPE_GOOD,
  MARKER_TYPE_BAD,
} from './IBusinessProvider'

describe('markerTypeLabel', () => {
  it('returns "Note" for type 0', () => {
    expect(markerTypeLabel(MARKER_TYPE_NOTE)).toBe('Note')
    expect(markerTypeLabel(0)).toBe('Note')
  })

  it('returns "Good Experience" for type 1', () => {
    expect(markerTypeLabel(MARKER_TYPE_GOOD)).toBe('Good Experience')
    expect(markerTypeLabel(1)).toBe('Good Experience')
  })

  it('returns "Bad Experience" for type 2', () => {
    expect(markerTypeLabel(MARKER_TYPE_BAD)).toBe('Bad Experience')
    expect(markerTypeLabel(2)).toBe('Bad Experience')
  })

  it('returns "Type N" fallback for unknown types', () => {
    expect(markerTypeLabel(5)).toBe('Type 5')
    expect(markerTypeLabel(99)).toBe('Type 99')
    expect(markerTypeLabel(-1)).toBe('Type -1')
  })
})

describe('markerTypeEmoji', () => {
  it('returns the note emoji for type 0', () => {
    expect(markerTypeEmoji(MARKER_TYPE_NOTE)).toBe('📝')
    expect(markerTypeEmoji(0)).toBe('📝')
  })

  it('returns the check emoji for type 1', () => {
    expect(markerTypeEmoji(MARKER_TYPE_GOOD)).toBe('✅')
    expect(markerTypeEmoji(1)).toBe('✅')
  })

  it('returns the x emoji for type 2', () => {
    expect(markerTypeEmoji(MARKER_TYPE_BAD)).toBe('❌')
    expect(markerTypeEmoji(2)).toBe('❌')
  })

  it('returns the question-mark fallback for unknown types', () => {
    expect(markerTypeEmoji(5)).toBe('❓')
    expect(markerTypeEmoji(99)).toBe('❓')
    expect(markerTypeEmoji(-1)).toBe('❓')
  })
})
