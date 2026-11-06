import type { BatchRowCounts } from './import-batches.service'

type FakeRow = { status: string; registrationOutcome?: string | null; validationWarnings?: unknown }

/** Groups in-memory rows the way readBatchRowCounts does. */
export function fakeRowCounts(rows: FakeRow[]): BatchRowCounts {
  const groups = new Map<string, BatchRowCounts[number]>()
  for (const row of rows) {
    const outcome = row.registrationOutcome ?? null
    const warned = Array.isArray(row.validationWarnings) && row.validationWarnings.length > 0
    const key = `${row.status}|${outcome}|${warned}`
    const group = groups.get(key) ?? { status: row.status, outcome, warned, rows: 0 }
    group.rows += 1
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** True for the readBatchRowCounts query. */
export const isRowCountsQuery = (sql: unknown) =>
  typeof (sql as { sql?: unknown })?.sql === 'string' &&
  (sql as { sql: string }).sql.includes('registration_outcome AS outcome')
