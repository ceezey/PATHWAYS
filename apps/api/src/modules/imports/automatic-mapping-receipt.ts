export interface AutomaticMappingReceipt {
  batchId: string
  mappingRevision: 1
  mapped: number
  pending: number
  requiredUnmapped: number
  complete: boolean
}
export function parseAutomaticMappingReceipt(
  value: unknown,
  expectedBatchId: string,
): AutomaticMappingReceipt {
  const keys = ['batchId', 'mappingRevision', 'mapped', 'pending', 'requiredUnmapped', 'complete']
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid automatic mapping receipt.')
  const row = value as Record<string, unknown>
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key)) ||
    row.batchId !== expectedBatchId ||
    row.mappingRevision !== 1 ||
    !['mapped', 'pending', 'requiredUnmapped'].every(
      (key) => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0,
    ) ||
    Number(row.mapped) + Number(row.pending) < 1 ||
    Number(row.mapped) + Number(row.pending) > 500 ||
    Number(row.mapped) > 100 ||
    Number(row.requiredUnmapped) > 100 ||
    typeof row.complete !== 'boolean' ||
    row.complete !== (row.pending === 0 && row.requiredUnmapped === 0)
  ) {
    throw new Error('Invalid automatic mapping receipt.')
  }
  return {
    batchId: expectedBatchId,
    mappingRevision: 1,
    mapped: Number(row.mapped),
    pending: Number(row.pending),
    requiredUnmapped: Number(row.requiredUnmapped),
    complete: row.complete,
  }
}
