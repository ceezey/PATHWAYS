export interface AutomaticMappingReceipt {
  batchId: string
  mappingRevision: 1
  mapped: number
  pending: number
  ignored: number
  requiredUnmapped: number
  complete: boolean
  coverage: 'COVERED' | 'NOT_COVERED'
  uncoveredColumns: number
  unresolvedValues: number
}
const counts = [
  'mapped',
  'pending',
  'ignored',
  'requiredUnmapped',
  'uncoveredColumns',
  'unresolvedValues',
]
const keys = ['batchId', 'mappingRevision', 'complete', 'coverage', ...counts]
export function parseAutomaticMappingReceipt(
  value: unknown,
  expectedBatchId: string,
): AutomaticMappingReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid automatic mapping receipt.')
  const row = value as Record<string, unknown>
  const columns = Number(row.mapped) + Number(row.pending) + Number(row.ignored)
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key)) ||
    row.batchId !== expectedBatchId ||
    row.mappingRevision !== 1 ||
    !counts.every((key) => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0) ||
    columns < 1 ||
    columns > 500 ||
    Number(row.mapped) > 100 ||
    Number(row.requiredUnmapped) > 100 ||
    typeof row.complete !== 'boolean' ||
    row.complete !== (row.pending === 0 && row.requiredUnmapped === 0) ||
    (row.coverage !== 'COVERED' && row.coverage !== 'NOT_COVERED') ||
    (row.coverage === 'COVERED' &&
      !(row.complete && row.uncoveredColumns === 0 && row.unresolvedValues === 0))
  ) {
    throw new Error('Invalid automatic mapping receipt.')
  }
  return {
    batchId: expectedBatchId,
    mappingRevision: 1,
    mapped: Number(row.mapped),
    pending: Number(row.pending),
    ignored: Number(row.ignored),
    requiredUnmapped: Number(row.requiredUnmapped),
    complete: row.complete,
    coverage: row.coverage,
    uncoveredColumns: Number(row.uncoveredColumns),
    unresolvedValues: Number(row.unresolvedValues),
  }
}
