import type { SupportedFormFieldType } from '@pathways/shared'
import { IMPORT_ENGINEERING_LIMITS } from '../limits'

/**
 * AUTO_SMART_V2 (cr-pathways-smart-import-mapping): deterministic header-to-field
 * matching shared by the API and the web preview. It is a pure function of its
 * inputs: no randomness, clock, locale, network or model call. Every score is an
 * integer from 0 to 100. Changing a threshold, tier, stop word or synonym requires a
 * new algorithm ID.
 *
 * Sampled cell values are read only to check value-type compatibility. They never
 * appear in the returned decisions.
 */
export const AUTO_SMART_V2 = 'AUTO_SMART_V2' as const

export const SMART_SYNONYMS_V2_ID = 'SMART_SYNONYMS_V2' as const

export const AUTO_SMART_V2_LIMITS = Object.freeze({
  autoMapScore: 90,
  suggestionScore: 60,
  minimumMargin: 10,
  valueGatePercent: 90,
  samplesPerColumn: 20,
  sampleRows: IMPORT_ENGINEERING_LIMITS.previewRows,
  maxColumns: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
  maxFields: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
  maxNameCharacters: 160,
  // Edit distance is evaluated only when both normalized names fit; this bounds the
  // worst case to columns * fields * 2 * 32 * 9 banded cells (about 60 ms measured).
  maxEditCodePoints: 32,
  maxSampleCharacters: IMPORT_ENGINEERING_LIMITS.maxCellCharacters,
  maxMultipleSelectParts: 50,
})

export const TIER = Object.freeze({
  exact: 100,
  synonym: 90,
  tokenSet: 85,
  reviewSynonym: 80,
  tokenOverlap: 80,
  editDistance: 70,
})

/** How the name matched. Stored as `match_reason`. */
export const SMART_MATCH_REASONS = [
  'EXACT',
  'SYNONYM',
  'SYNONYM_REVIEW',
  'TOKEN_SET',
  'TOKEN_OVERLAP',
  'EDIT_DISTANCE',
] as const

export type SmartMatchReason = (typeof SMART_MATCH_REASONS)[number]

/** Why the column ended up MAPPED or PENDING. Stored after `AUTO_SMART_V2:`. */
export const SMART_DECISION_REASONS = [
  'AUTO_MATCH',
  'SUGGESTED',
  'HELD_CONTESTED',
  'HELD_MARGIN',
  'HELD_VALUE_GATE',
  'HELD_NO_SAMPLES',
  'NO_MATCH',
  'EMPTY_NAME',
] as const

export type SmartDecisionReason = (typeof SMART_DECISION_REASONS)[number]

/**
 * Reviewed synonym list, keyed by canonical field code. Values are compared after
 * the same normalization as headers. Not user-editable.
 */
export const SMART_SYNONYMS_V2: Readonly<Record<string, readonly string[]>> = Object.freeze({
  first_name: ['given name', 'firstname', 'fname', 'forename', 'beneficiary first name'],
  middle_name: ['middlename', 'mname', 'beneficiary middle name'],
  last_name: ['surname', 'family name', 'lastname', 'lname', 'beneficiary last name'],
  display_name: ['full name', 'fullname', 'complete name', 'name', 'beneficiary name'],
  birth_date: ['dob', 'd o b', 'date of birth', 'birthday', 'birthdate', 'birth day'],
  sex: ['sex at birth', 'biological sex'],
  age_at_registration: ['age', 'age years', 'age at enrollment', 'age at enrolment'],
  beneficiary_code: [
    'beneficiary id',
    'beneficiary no',
    'beneficiary number',
    'participant id',
    'participant code',
  ],
  enrollment_date: [
    'date enrolled',
    'enrolment date',
    'date of enrollment',
    'registration date',
    'date registered',
  ],
  disability_status: ['disability', 'pwd', 'pwd status', 'with disability', 'has disability'],
  location_barangay: ['barangay', 'brgy'],
  location_city_municipality: ['city', 'municipality', 'city municipality', 'town'],
  location_province: ['province'],
  consent_recorded: ['consent', 'consent given'],
  guardian_consent_recorded: ['guardian consent', 'parental consent'],
  is_minor: ['minor'],
  attendance_status: ['attendance', 'attended'],
})

/**
 * Synonyms that may only ever be suggested. SADDD treats sex and gender as different
 * concepts, so neither is an automatic synonym for the other.
 */
export const SMART_REVIEW_SYNONYMS_V2: Readonly<Record<string, readonly string[]>> = Object.freeze({
  sex: ['gender'],
  gender: ['sex'],
})

/** Fixed stop words removed before the token-set comparison. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'for',
  'in',
  'on',
  'at',
  'to',
  'by',
  'with',
  'beneficiary',
  'participant',
  'respondent',
])

export interface SmartMatchColumn {
  key: string
  columnIndex: number
  header: string
  /** Bounded raw sample; at most samplesPerColumn non-blank values are read. */
  samples: readonly unknown[]
}

export interface SmartMatchField {
  id: string
  code: string
  label: string
  dataType: SupportedFormFieldType
  allowedValues?: readonly string[] | null
  minimumLength?: number | null
  maximumLength?: number | null
}

export interface SmartMatchDecision {
  sourceKey: string
  columnIndex: number
  status: 'MAPPED' | 'PENDING'
  targetFieldId: string | null
  suggestedFieldId: string | null
  score: number | null
  matchReason: SmartMatchReason | null
  reason: SmartDecisionReason
}

export class SmartMatchInputError extends Error {
  constructor() {
    super('Smart mapping input exceeds its bounds.')
    this.name = 'SmartMatchInputError'
  }
}
