import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

export const mappingLockedStatuses = new Set([
  'PROCESSING',
  'PARTIALLY_PROCESSED',
  'PROCESSED',
  'FAILED',
])

export function batchTone(status: ImportBatchDefinition['status']) {
  if (status === 'PROCESSED') return 'success' as const
  if (status === 'FAILED' || status === 'RECOVERY_REQUIRED') return 'danger' as const
  if (status === 'PARTIALLY_PROCESSED') return 'warning' as const
  return 'info' as const
}

export function rowTone(status: ImportRowDefinition['status']) {
  if (status === 'PROCESSED') return 'success' as const
  if (status === 'INVALID' || status === 'FAILED') return 'danger' as const
  return status === 'UNPROCESSED' ? ('warning' as const) : ('info' as const)
}

export const headClass = 'h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

type StoredMapping = NonNullable<ImportBatchDefinition['mappings']>[number]

const matchReasonLabels: Record<string, string> = {
  EXACT: 'exact name',
  SYNONYM: 'known synonym',
  SYNONYM_REVIEW: 'related term',
  TOKEN_SET: 'same words',
  TOKEN_OVERLAP: 'shared words',
  EDIT_DISTANCE: 'close spelling',
}

/** Why the server auto-mapped a column, or null for manual and pending choices. */
export function automaticMatchReason(stored: StoredMapping | undefined) {
  if (stored?.status !== 'MAPPED' || !stored.validationMessage) return null
  if (/^AUTO_SMART_V[23]:/.test(stored.validationMessage)) {
    return matchReasonLabels[stored.matchReason ?? ''] ?? 'automatic match'
  }
  return stored.validationMessage.startsWith('AUTO_CODE_LABEL_V1:') ? 'exact name' : null
}

export function displayValue(value: unknown) {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '')
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}
