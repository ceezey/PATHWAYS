// Pure parsers for the defense snapshot: wipe table list, wipe split point and pg_dump COPY blocks.
const REVOKE_MARKER = '-- Drop exactly the temporary memberships added above.'
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/
const COPY_HEADER = /^COPY ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) \((.+)\) FROM stdin;$/
const PREAMBLE = [
  /^$/,
  /^--/,
  /^SET [a-z_]+ = .+;$/,
  /^SELECT pg_catalog\.set_config\(.+\);$/,
  /^\\(?:restrict|unrestrict) \S+$/,
]

/** Tables truncated by the wipe file, as schema.table in file order. */
export function parseWipeTables(wipeSql) {
  const code = wipeSql.replace(/--.*$/gm, '')
  const statements = code.match(/\bTRUNCATE\s+TABLE\b[^;]*;/gi) ?? []
  if (statements.length !== 1)
    throw new Error('Wipe file must have exactly one TRUNCATE TABLE statement.')
  const tables = statements[0]
    .replace(/^TRUNCATE\s+TABLE/i, '')
    .replace(/RESTART\s+IDENTITY\s*;$/i, '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  for (const name of tables)
    if (!TABLE_NAME.test(name)) throw new Error(`Unexpected table name in wipe file: ${name}`)
  return tables
}

/** Splits the wipe file before its revoke so the restore loads data inside the same transaction. */
export function splitWipe(wipeSql) {
  const at = wipeSql.indexOf(REVOKE_MARKER)
  if (at < 0 || wipeSql.indexOf(REVOKE_MARKER, at + 1) >= 0)
    throw new Error('Wipe file layout changed: the revoke marker must appear exactly once.')
  const head = wipeSql.slice(0, at)
  const tail = wipeSql.slice(at)
  const shapeOk =
    /^BEGIN;$/m.test(head) &&
    !/^COMMIT;$/m.test(head) &&
    /\bREVOKE\b/.test(tail) &&
    /COMMIT;\s*$/.test(tail)
  if (!shapeOk)
    throw new Error('Wipe file layout changed: expected BEGIN before and REVOKE plus COMMIT after.')
  return { head, tail }
}

/** Parses pg_dump data-only output into COPY blocks, rejecting any statement but session settings. */
export function parseDump(text) {
  if (text.includes('\r\n')) throw new Error('Dump has CRLF line endings; run dump again.')
  const blocks = []
  let block = null
  for (const line of text.split('\n')) {
    if (block) {
      if (line === '\\.') {
        blocks.push(block)
        block = null
      } else block.rows.push(line)
      continue
    }
    const header = COPY_HEADER.exec(line)
    if (header) {
      block = { schema: header[1], table: header[2], columns: header[3], rows: [] }
      continue
    }
    if (!PREAMBLE.some((pattern) => pattern.test(line)))
      throw new Error(`Unexpected statement in dump: ${line.slice(0, 80)}`)
  }
  if (block) throw new Error(`Dump ends inside COPY for ${block.schema}.${block.table}.`)
  return { blocks }
}

/** Row count per dumped table. */
export const countsOf = (blocks) =>
  blocks.map((block) => ({ name: `${block.schema}.${block.table}`, rows: block.rows.length }))

/** Lists every table whose count differs between two count lists. */
export function compareCounts(expected, actual) {
  const found = new Map(actual.map((entry) => [entry.name, entry.rows]))
  const problems = expected
    .filter((entry) => found.get(entry.name) !== entry.rows)
    .map(
      (entry) => `${entry.name}: expected ${entry.rows}, found ${found.get(entry.name) ?? 'none'}`,
    )
  const known = new Set(expected.map((entry) => entry.name))
  for (const entry of actual)
    if (!known.has(entry.name)) problems.push(`${entry.name}: not in manifest`)
  return problems
}

/** Refuses a dump that does not cover exactly the wipe table list. */
export function assertSameTables(tables, blocks) {
  const dumped = blocks.map((block) => `${block.schema}.${block.table}`).sort()
  if (dumped.join(',') !== [...tables].sort().join(','))
    throw new Error(
      'Dumped tables differ from the wipe list; dump again from the current wipe file.',
    )
}
