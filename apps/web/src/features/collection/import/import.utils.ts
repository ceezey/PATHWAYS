import type { ImportHoldCode } from '@pathways/shared'

import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

// Why the server refused a stored upload, in its own words when it gave them.
export const uploadFailure = (batch: Pick<ImportBatchDefinition, 'status' | 'failureMessage'>) =>
  batch.status === 'FAILED' ? (batch.failureMessage ?? 'The file could not be imported.') : null

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

// Plain words for why a row is held; a Record keeps every hold code covered.
const holdReasons: Record<ImportHoldCode, string> = {
  CONSENT_REQUIRED: 'Consent is missing',
  GUARDIAN_CONSENT_REQUIRED: 'Under 18, waiting for guardian approval',
  AMBIGUOUS_IDENTITY: 'More than one participant could match',
  IDENTITY_REVIEW_REQUIRED: 'The participant match needs checking',
  DUPLICATE_IDENTITY: 'Looks like a participant already in PATHWAYS',
  UNKNOWN_IDENTITY: 'No matching participant found',
  IDENTIFIER_CODE_CONFLICT: 'Client ID and participant code do not agree',
  SUBJECT_TYPE_CONFLICT: 'Participant type does not match',
  SHARED_PROFILE_UPDATE_REVIEW_REQUIRED: 'Change to a shared profile needs review',
  PROFILE_CHANGED: 'Values differ from PATHWAYS',
  IDENTITY_CONFLICT: 'Client ID is used by more than one participant',
  IDENTITY_MISSING: 'Client ID is missing',
}

export const holdReason = (code: string | null) =>
  (code ? holdReasons[code as ImportHoldCode] : undefined) ?? 'Needs review'

// The participant name from the mapped first and last name columns, or a fallback when the file has none.
export function participantName(
  row: Pick<ImportRowDefinition, 'rawData'>,
  mappings: ImportBatchDefinition['mappings'],
) {
  const column = (code: string) =>
    mappings?.find((item) => item.status === 'MAPPED' && item.targetField?.code === code)
      ?.sourceFieldName
  const name = ['first_name', 'last_name']
    .map((code) => String(row.rawData[column(code) ?? ''] ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || 'Name not in file'
}
