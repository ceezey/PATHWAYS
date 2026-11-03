import type { FileCheckReport } from '@pathways/imports'
import { CONSENT_FIELD_CODES, type ImportHoldCode } from '@pathways/shared'

import type { DigitalFormType, ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { enumLabel } from '../collection.copy'

// Checked in order; surveys repeat the identity columns, so registration comes last.
const formTypeHeaders: Array<[DigitalFormType, RegExp]> = [
  ['PRE_TEST', /\bpre[\s_-]?test/i],
  ['POST_TEST', /\bpost[\s_-]?test/i],
  ['ACTIVITY_MONITORING', /\b(?:activity|attendance|venue)/i],
  ['OUTCOME_MONITORING', /\boutcome/i],
  ['TRAINING_SURVEY', /\b(?:training|survey)/i],
  [
    'BENEFICIARY_REGISTRATION',
    /\b(?:first[\s_]?name|last[\s_]?name|surname|birth|sex\b|gender|consent)/i,
  ],
]

/** The form type a file's headers look like, or null when no header says. */
export const guessFormType = (headers: readonly string[]) =>
  formTypeHeaders.find(([, pattern]) => headers.some((header) => pattern.test(header)))?.[0] ?? null

// Why the server refused a stored upload, in its own words when it gave them.
export const uploadFailure = (batch: Pick<ImportBatchDefinition, 'status' | 'failureMessage'>) =>
  batch.status === 'FAILED' ? (batch.failureMessage ?? 'The file could not be imported.') : null

// A required form field has no column in the file, so the rows cannot pass until the form or the file changes.
export const missesRequiredColumn = (report: FileCheckReport) =>
  report.problems.some((problem) => problem.kind === 'NO_COLUMN')

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

const scoreMismatch = 'The total score does not match the answer key'

// Plain words for why a row is held; a Record keeps every hold code covered.
const holdReasons: Record<ImportHoldCode | 'TOTAL_SCORE_MISMATCH', string> = {
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
  STAGE_CHANGED: 'Answers differ from PATHWAYS',
  STAGE_DATE_MISSING: 'This survey has answers but no date',
  STAGE_DATE_OUTSIDE_ENROLLMENT: "The survey date is outside this person's enrollment",
  STAGE_IDENTITY_MISMATCH: "The name or ID differs from the participant's profile",
  STAGE_CONSENT_MISSING: 'Consent is not recorded for this survey. Upload a corrected file.',
  TOTAL_SCORE_MISMATCH: scoreMismatch,
}

export const identityFields = ['first_name', 'last_name', 'birth_date', 'external_identifier_value']

// Where a reviewer checks a held row that has no changed value to decide.
export const fieldsOfReason: Partial<Record<string, readonly string[]>> = {
  CONSENT_REQUIRED: CONSENT_FIELD_CODES,
  GUARDIAN_CONSENT_REQUIRED: ['guardian_consent_recorded'],
  AMBIGUOUS_IDENTITY: identityFields,
  IDENTITY_REVIEW_REQUIRED: identityFields,
  DUPLICATE_IDENTITY: identityFields,
  UNKNOWN_IDENTITY: identityFields,
  IDENTIFIER_CODE_CONFLICT: ['external_identifier_value'],
  SUBJECT_TYPE_CONFLICT: ['subject_type'],
  IDENTITY_CONFLICT: identityFields,
  IDENTITY_MISSING: ['external_identifier_value'],
  STAGE_CONSENT_MISSING: ['stage_consent'],
  STAGE_IDENTITY_MISMATCH: ['external_identifier_value', 'first_name', 'middle_name', 'last_name'],
}

// Why an invalid registration row waits for a reviewer, by its validation code.
const validationReasons: Record<string, string> = {
  AGE_MISMATCH: 'Age does not match the birth date',
  BIRTH_AFTER_DATE: 'Birth date is after the date age is measured',
  CALCULATION_MISMATCH: 'File value does not match the calculated value',
  DUPLICATE_BUSINESS_KEY: 'This row repeats another row in the file',
  IDENTITY_CONFLICT: 'Client ID is used more than once',
  TOTAL_SCORE_MISMATCH: scoreMismatch,
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

const invalidRow = 'A value in this row is not valid'

type ReasonRow = Pick<ImportRowDefinition, 'status' | 'processingErrorCode' | 'validationErrors'>

// The form label of a field the batch maps to, or its code in words when no column maps to it.
const fieldLabel = (code: string, mappings: ImportBatchDefinition['mappings']) =>
  mappings?.find((item) => item.targetField?.code === code)?.targetField?.label ?? enumLabel(code)

// The plain reason a row is held: its hold code, or for an invalid row its first validation code, naming the field.
export function rowReason(row: ReasonRow, mappings?: ImportBatchDefinition['mappings']) {
  if (row.status !== 'INVALID') return holdReason(row.processingErrorCode)
  const error = row.validationErrors[0]
  if (!error) return invalidRow
  if (error.code === 'CALCULATION_MISMATCH')
    return `${fieldLabel(error.fieldCode, mappings)} in the file does not match its calculated value`
  if (validationReasons[error.code]) return validationReasons[error.code]
  if (!error.fieldCode) return invalidRow
  const label = fieldLabel(error.fieldCode, mappings)
  if (error.code === 'required') return `${label} is missing`
  if (error.code === 'AMBIGUOUS_DATE') return `${label} is not a date PATHWAYS can read`
  return `${label} is not valid`
}

/** What an invalid row's reason means, or undefined when the reason speaks for itself. */
export const rowReasonHelp = (row: ReasonRow) =>
  row.status === 'INVALID' ? validationHelp[row.validationErrors[0]?.code ?? ''] : undefined

// The plain reason a review window shows for its reason code: a hold code, or an invalid row's first validation code.
export const reviewReason = (code: string) =>
  knownHoldReason(code) ?? validationReasons[code] ?? invalidRow

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
