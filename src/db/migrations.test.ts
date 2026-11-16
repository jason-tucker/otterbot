import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const DIR = join(__dirname, 'migrations')

type Entry = { idx: number; when: number; tag: string }
const journal = JSON.parse(readFileSync(join(DIR, 'meta', '_journal.json'), 'utf8')) as {
  entries: Entry[]
}
// Raw bytes, exactly as drizzle's migrator hashes them (no newline normalisation).
const readRaw = (tag: string) => readFileSync(join(DIR, `${tag}.sql`))
const read = (tag: string) => readRaw(tag).toString('utf8')

// A destructive statement must be acknowledged with a
// `-- obd3:allow-destructive <reason>` comment inside the SAME statement chunk
// (i.e. between the previous `;` and its own terminating `;`).
const DESTRUCTIVE: [string, RegExp][] = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP COLUMN', /\bDROP\s+COLUMN\b/i],
  // ALTER TABLE t DROP col (COLUMN keyword optional); not DROP CONSTRAINT/DEFAULT/NOT NULL/IDENTITY/EXPRESSION.
  [
    'ALTER TABLE ... DROP',
    /\bALTER\s+TABLE\b[^;]*?\bDROP\s+(?!COLUMN\b|CONSTRAINT\b|DEFAULT\b|NOT\b|IDENTITY\b|EXPRESSION\b)/i,
  ],
  ['DROP VIEW', /\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/i],
  ['DROP SEQUENCE', /\bDROP\s+SEQUENCE\b/i],
  ['DROP FUNCTION', /\bDROP\s+FUNCTION\b/i],
  ['UPDATE', /(?<!\bON\s+)\bUPDATE\s+(?:ONLY\s+)?[\w".]+\s+SET\b/i],
  ['DROP SCHEMA', /\bDROP\s+SCHEMA\b/i],
  ['DROP TYPE', /\bDROP\s+TYPE\b/i],
  ['DROP CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
  ['DROP INDEX', /\bDROP\s+INDEX\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['ALTER COLUMN ... TYPE', /\bALTER\s+COLUMN\b[^;]*?\bTYPE\b/i],
  ['ALTER TYPE', /\bALTER\s+TYPE\b/i],
  ['RENAME COLUMN', /\bRENAME\s+COLUMN\b/i],
  ['RENAME TO', /\bRENAME\s+TO\b/i],
  ['DELETE FROM', /\bDELETE\s+FROM\b/i],
]
const ALLOW = /^\s*--\s*obd3:allow-destructive[ \t]+\S.*$/m

const stripComments = (sql: string) => sql.replace(/--.*$/gm, '')

/** Splits on `;` but never inside a `$tag$ ... $tag$` dollar-quoted body. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let start = 0
  let i = 0
  while (i < sql.length) {
    if (sql[i] === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length)
        i = end === -1 ? sql.length : end + m[0].length
        continue
      }
    } else if (sql[i] === ';') {
      out.push(sql.slice(start, i))
      start = i + 1
    }
    i++
  }
  out.push(sql.slice(start))
  return out
}

/** Names of destructive operations found in statements that lack an annotation. */
export function destructiveFindings(sql: string): string[] {
  const found = new Set<string>()
  for (const chunk of splitStatements(sql)) {
    if (ALLOW.test(chunk)) continue
    // Ignore comments so ordinary comment text cannot trigger a match.
    const code = stripComments(chunk)
    for (const [name, re] of DESTRUCTIVE) if (re.test(code)) found.add(name)
  }
  return [...found]
}

describe('migration journal', () => {
  it('has a .sql file for every entry', () => {
    for (const e of journal.entries) expect(existsSync(join(DIR, `${e.tag}.sql`)), e.tag).toBe(true)
  })

  it('has strictly increasing idx and when', () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i)
      if (i > 0) expect(e.when).toBeGreaterThan(journal.entries[i - 1].when)
    })
  })

  it('has LF-only migration files (drizzle hashes the raw bytes)', () => {
    for (const e of journal.entries) expect(readRaw(e.tag).includes(0x0d), `${e.tag}.sql has CR`).toBe(false)
  })

  it('starts with the baseline', () => {
    expect(journal.entries[0].tag).toBe('0000_baseline')
  })
})

describe('baseline marker SQL', () => {
  const marker = readFileSync(join(ROOT, 'scripts', 'db', 'baseline-mark-applied.sql'), 'utf8')
  const baseline = journal.entries[0]

  it('uses the sha256 of 0000_baseline.sql', () => {
    const hash = createHash('sha256').update(readRaw(baseline.tag)).digest('hex')
    expect(marker).toContain(`'${hash}'`)
  })

  it('uses the journal "when" of the baseline', () => {
    const whens = marker.match(/\b\d{13}\b/g) ?? []
    expect(whens.length).toBeGreaterThan(0)
    for (const w of whens) expect(Number(w)).toBe(baseline.when)
  })

  it('lists every table created by the baseline', () => {
    const created = [...read(baseline.tag).matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1])
    expect(created.length).toBe(11)
    for (const t of created) expect(marker).toContain(`'${t}'`)
  })
})

describe('destructive migration lint', () => {
  it('flags unannotated destructive statements (self-test)', () => {
    expect(destructiveFindings('ALTER TABLE a DROP COLUMN b;')).toEqual(['DROP COLUMN'])
    expect(destructiveFindings('ALTER TABLE a ALTER COLUMN b SET DATA TYPE int;')).toEqual([
      'ALTER COLUMN ... TYPE',
    ])
    expect(destructiveFindings('TRUNCATE a;')).toEqual(['TRUNCATE'])
    expect(destructiveFindings('ALTER TYPE e ADD VALUE \'x\';')).toEqual(['ALTER TYPE'])
    expect(destructiveFindings('-- drop table later\nALTER TABLE a ADD COLUMN b int;')).toEqual([])
  })

  it('requires the annotation per statement, not per file', () => {
    const annotated = '-- obd3:allow-destructive phase 2 of col drop\nALTER TABLE a DROP COLUMN b;'
    expect(destructiveFindings(annotated)).toEqual([])
    expect(destructiveFindings(annotated + '\nALTER TABLE a DROP COLUMN c;')).toEqual(['DROP COLUMN'])
    expect(destructiveFindings('-- obd3:allow-destructive\nDROP TABLE x;')).toEqual(['DROP TABLE'])
  })

  it('flags ALTER TABLE DROP without COLUMN, views, sequences, functions and UPDATE', () => {
    expect(destructiveFindings('ALTER TABLE a DROP b;')).toEqual(['ALTER TABLE ... DROP'])
    expect(destructiveFindings('ALTER TABLE a ADD COLUMN c int, DROP b;')).toEqual(['ALTER TABLE ... DROP'])
    expect(destructiveFindings('DROP VIEW v;')).toEqual(['DROP VIEW'])
    expect(destructiveFindings('DROP MATERIALIZED VIEW v;')).toEqual(['DROP VIEW'])
    expect(destructiveFindings('DROP SEQUENCE s;')).toEqual(['DROP SEQUENCE'])
    expect(destructiveFindings('DROP FUNCTION f();')).toEqual(['DROP FUNCTION'])
    expect(destructiveFindings('UPDATE a SET x = 1;')).toEqual(['UPDATE'])
    // not destructive: FK actions, constraint/default drops, plain adds
    expect(destructiveFindings('ALTER TABLE a ADD CONSTRAINT f FOREIGN KEY (x) REFERENCES b(id) ON DELETE set null ON UPDATE no action;')).toEqual([])
    expect(destructiveFindings('ALTER TABLE a ALTER COLUMN b DROP DEFAULT;')).toEqual([])
    expect(destructiveFindings('ALTER TABLE a ALTER COLUMN b DROP NOT NULL;')).toEqual([])
  })

  it('does not split statements inside $$ bodies', () => {
    const body = 'DO $$ BEGIN\n  PERFORM 1;\n  PERFORM 2;\nEND $$;'
    expect(splitStatements(body)).toEqual(['DO $$ BEGIN\n  PERFORM 1;\n  PERFORM 2;\nEND $$', ''])
    // the annotation inside the same $$ statement covers the destructive call inside it
    expect(
      destructiveFindings('DO $tag$ BEGIN\n-- obd3:allow-destructive cleanup\nDELETE FROM a; END $tag$;'),
    ).toEqual([])
    expect(destructiveFindings('DO $$ BEGIN DELETE FROM a; END $$;')).toEqual(['DELETE FROM'])
  })

  it('flags renames and row deletes', () => {
    expect(destructiveFindings('ALTER TABLE a RENAME COLUMN b TO c;')).toEqual(['RENAME COLUMN'])
    expect(destructiveFindings('ALTER TABLE a RENAME TO z;')).toEqual(['RENAME TO'])
    expect(destructiveFindings('DELETE FROM a WHERE x = 1;')).toEqual(['DELETE FROM'])
  })

  it('has no unannotated destructive statement after the baseline', () => {
    for (const e of journal.entries.slice(1)) {
      const found = destructiveFindings(read(e.tag))
      expect(
        found,
        `${e.tag}.sql has unannotated ${found.join(', ')}; add a "-- obd3:allow-destructive <reason>" comment inside that statement`,
      ).toEqual([])
    }
  })
})
