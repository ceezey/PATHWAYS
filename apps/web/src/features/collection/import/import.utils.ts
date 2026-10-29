import type { ImportHoldCode } from '@pathways/shared'

import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { enumLabel } from '../collection.copy'

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
  IDENTITY_CONFLICT: 'Client ID belongs to a participant with different details',
  IDENTITY_MISSING: 'Client ID is missing',
}

// Why an invalid registration row waits for a reviewer, by its validation code.
const validationReasons: Record<string, string> = {
  AGE_MISMATCH: 'Age does not match the birth date',
  BIRTH_AFTER_DATE: 'Birth date is after the date age is measured',
  CALCULATION_MISMATCH: 'File value does not match the calculated value',
  IDENTITY_CONFLICT: 'Client ID is used more than once',
}

/** The plain reason for a real hold code, or undefined for any other code. */
export const knownHoldReason = (code: string | null) =>
  code ? (holdReasons as Record<string, string>)[code] : undefined

export const holdReason = (code: string | null) => knownHoldReason(code) ?? 'Needs review'

// What a validation reason means and where to look, shown on hover beside it.
const validationHelp: Record<string, string> = {
  AGE_MISMATCH:
    "The file's age does not match the age worked out from the birth date. One of the two is wrong in the file; a birth date with its day and month swapped is the usual cause.",
  BIRTH_AFTER_DATE:
    "The birth date is later than the date the age is measured at (the date set in the form's age rule, or the upload date for minor status), so no age can be worked out. The birth date was most likely entered wrongly, for example with its day and month swapped or the wrong year.",
  CALCULATION_MISMATCH:
    "PATHWAYS works this field out from the row's other answers, such as age from the birth and enrollment dates, and the file's value is different. Check the answers it is worked out from, usually the birth date.",
}

type ReasonRow = Pick<ImportRowDefinition, 'status' | 'processingErrorCode' | 'validationErrors'>

// The form label of a field the batch maps to, or its code in words when no column maps to it.
const fieldLabel = (code: string, mappings: ImportBatchDefinition['mappings']) =>
  mappings?.find((item) => item.targetField?.code === code)?.targetField?.label ?? enumLabel(code)

// The plain reason a row is held: its hold code, or for an invalid row its first validation code, naming the field.
export function rowReason(row: ReasonRow, mappings?: ImportBatchDefinition['mappings']) {
  if (row.status !== 'INVALID') return holdReason(row.processingErrorCode)
  const error = row.validationErrors[0]
  if (error?.code === 'CALCULATION_MISMATCH')
    return `${fieldLabel(error.fieldCode, mappings)} in the file does not match its calculated value`
  return (error ? validationReasons[error.code] : undefined) ?? 'A value in this row is not valid'
}

/** What an invalid row's reason means, or undefined when the reason speaks for itself. */
export const rowReasonHelp = (row: ReasonRow) =>
  row.status === 'INVALID' ? validationHelp[row.validationErrors[0]?.code ?? ''] : undefined

// The plain reason a review window shows for its reason code: a hold code, or an invalid row's first validation code.
export const reviewReason = (code: string) =>
  knownHoldReason(code) ?? validationReasons[code] ?? 'A value in this row is not valid'

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
