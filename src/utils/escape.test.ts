import { describe, it, expect } from 'vitest'
import { safeInlineCode, safeMarkdown, safeMarkdownLinkLabel } from './escape'

describe('safeInlineCode', () => {
  it('passes already-clean input through unchanged', () => {
    expect(safeInlineCode('hello world')).toBe('hello world')
    expect(safeInlineCode('555-1234')).toBe('555-1234')
  })

  it('strips backticks from mixed input', () => {
    expect(safeInlineCode('hello`world')).toBe('helloworld')
    expect(safeInlineCode('a`b`c')).toBe('abc')
    expect(safeInlineCode('```triple```')).toBe('triple')
  })

  it('handles edge cases (empty + only special chars)', () => {
    expect(safeInlineCode('')).toBe('')
    expect(safeInlineCode('`')).toBe('')
    expect(safeInlineCode('``````')).toBe('')
  })
})

describe('safeMarkdown', () => {
  it('passes already-clean input through unchanged', () => {
    expect(safeMarkdown('hello world')).toBe('hello world')
    expect(safeMarkdown('plain text 123')).toBe('plain text 123')
  })

  it('escapes formatting characters in mixed input', () => {
    expect(safeMarkdown('**bold**')).toBe('\\*\\*bold\\*\\*')
    expect(safeMarkdown('a_b~c')).toBe('a\\_b\\~c')
    expect(safeMarkdown('use `code` here')).toBe('use \\`code\\` here')
    expect(safeMarkdown('pipe|spoiler')).toBe('pipe\\|spoiler')
    expect(safeMarkdown('quote > text')).toBe('quote \\> text')
    expect(safeMarkdown('back\\slash')).toBe('back\\\\slash')
  })

  it('handles edge cases (empty + only special chars)', () => {
    expect(safeMarkdown('')).toBe('')
    expect(safeMarkdown('*')).toBe('\\*')
    expect(safeMarkdown('\\`*_~|>')).toBe('\\\\\\`\\*\\_\\~\\|\\>')
  })
})

describe('safeMarkdownLinkLabel', () => {
  it('passes already-clean input through unchanged', () => {
    expect(safeMarkdownLinkLabel('hello world')).toBe('hello world')
    expect(safeMarkdownLinkLabel('item name')).toBe('item name')
  })

  it('escapes link-syntax characters in mixed input', () => {
    expect(safeMarkdownLinkLabel('foo[bar]')).toBe('foo\\[bar\\]')
    expect(safeMarkdownLinkLabel('item (special)')).toBe('item \\(special\\)')
    expect(safeMarkdownLinkLabel('a]b(c\\d')).toBe('a\\]b\\(c\\\\d')
  })

  it('handles edge cases (empty + only special chars)', () => {
    expect(safeMarkdownLinkLabel('')).toBe('')
    expect(safeMarkdownLinkLabel('[')).toBe('\\[')
    expect(safeMarkdownLinkLabel('()[]\\')).toBe('\\(\\)\\[\\]\\\\')
  })
})
