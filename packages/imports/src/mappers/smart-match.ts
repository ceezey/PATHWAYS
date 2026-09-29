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

const TIER = Object.freeze({
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
const STOP_WORDS: ReadonlySet<string> = new Set([
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

/** The approved V1 normalizer (p29_mapping_name_v1): NFKC, ASCII trim and A-Z folding. */
export function normalizeMappingNameV1(value: string) {
  return value
    .normalize('NFKC')
    .replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '')
    .replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32))
    .replace(/[ \t\n\r\f\v-]+/g, '_')
}

/** V1 name split into tokens on underscores and ASCII punctuation. */
function tokensOf(v1Name: string) {
  return v1Name.split(/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+/).filter(Boolean)
}

interface PreparedName {
  v1: string
  canonical: string
  codePoints: number[]
  tokens: ReadonlySet<string>
  content: ReadonlySet<string>
}

function prepareName(value: string): PreparedName {
  const v1 = normalizeMappingNameV1(value)
  const tokens = tokensOf(v1)
  const canonical = tokens.join('_')
  const content = tokens.filter((token) => !STOP_WORDS.has(token))
  return {
    v1,
    canonical,
    codePoints: Array.from(canonical, (character) => character.codePointAt(0) ?? 0),
    tokens: new Set(tokens),
    content: new Set(content),
  }
}

function canonicalSynonyms(source: Readonly<Record<string, readonly string[]>>) {
  const result = new Map<string, ReadonlySet<string>>()
  for (const [code, names] of Object.entries(source)) {
    result.set(
      normalizeMappingNameV1(code),
      new Set(names.map((name) => prepareName(name).canonical)),
    )
  }
  return result
}

const AUTOMATIC_SYNONYMS = canonicalSynonyms(SMART_SYNONYMS_V2)
const REVIEW_SYNONYMS = canonicalSynonyms(SMART_REVIEW_SYNONYMS_V2)

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false
  for (const item of left) if (!right.has(item)) return false
  return true
}

// Reused rows for the common case; the function is synchronous, so it never interleaves.
const rowBuffers = [
  new Int32Array(AUTO_SMART_V2_LIMITS.maxEditCodePoints + 1),
  new Int32Array(AUTO_SMART_V2_LIMITS.maxEditCodePoints + 1),
]

/**
 * Levenshtein distance limited to `limit`: exact when the distance is at most
 * `limit`, otherwise `limit + 1`. Work is bounded by length * (2 * limit + 1).
 */
export function boundedEditDistance(
  left: readonly number[],
  right: readonly number[],
  limit: number,
) {
  const outside = limit + 1
  if (Math.abs(left.length - right.length) > limit) return outside
  const width = right.length
  const reuse = width < rowBuffers[0].length
  let previous = reuse ? rowBuffers[0] : new Int32Array(width + 1)
  let current = reuse ? rowBuffers[1] : new Int32Array(width + 1)
  for (let j = 0; j <= width; j++) previous[j] = j <= limit ? j : outside
  for (let i = 1; i <= left.length; i++) {
    const low = i - limit > 1 ? i - limit : 1
    const high = i + limit < width ? i + limit : width
    const character = left[i - 1]
    let diagonal = previous[low - 1]
    let before = low === 1 && i <= limit ? i : outside
    current[low - 1] = before
    let rowMinimum = before
    for (let j = low; j <= high; j++) {
      const above = previous[j]
      let value = diagonal + (character === right[j - 1] ? 0 : 1)
      if (above + 1 < value) value = above + 1
      if (before + 1 < value) value = before + 1
      if (value > outside) value = outside
      current[j] = value
      if (value < rowMinimum) rowMinimum = value
      diagonal = above
      before = value
    }
    if (high < width) current[high + 1] = outside
    if (rowMinimum > limit) return outside
    const swap = previous
    previous = current
    current = swap
  }
  return previous[width] < outside ? previous[width] : outside
}

interface ScoredName {
  score: number
  reason: SmartMatchReason
}

/** Name tiers after exact and synonym checks. Below the suggestion floor scores 0. */
function similarity(source: PreparedName, target: PreparedName): ScoredName | null {
  if (source.content.size > 0 && setsEqual(source.content, target.content)) {
    return { score: TIER.tokenSet, reason: 'TOKEN_SET' }
  }
  let score = 0
  let reason: SmartMatchReason = 'TOKEN_OVERLAP'
  const left = source.content.size > 0 ? source.content : source.tokens
  const right = target.content.size > 0 ? target.content : target.tokens
  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  const union = left.size + right.size - shared
  if (union > 0 && shared > 0) score = Math.floor((TIER.tokenOverlap * shared) / union)
  const longer = Math.max(source.codePoints.length, target.codePoints.length)
  if (longer > 0 && longer <= AUTO_SMART_V2_LIMITS.maxEditCodePoints && score < TIER.editDistance) {
    // A distance above longer / 7 scores below the suggestion floor, so it is not computed.
    const limit = Math.floor(longer / 7)
    const distance = boundedEditDistance(source.codePoints, target.codePoints, limit)
    const edit =
      distance <= limit ? Math.floor((TIER.editDistance * (longer - distance)) / longer) : 0
    if (edit > score) {
      score = edit
      reason = 'EDIT_DISTANCE'
    }
  }
  return score >= AUTO_SMART_V2_LIMITS.suggestionScore ? { score, reason } : null
}

interface PreparedField {
  field: SmartMatchField
  code: PreparedName
  label: PreparedName
  allowed: ReadonlySet<string>
}

function nameScore(source: PreparedName, target: PreparedField): ScoredName | null {
  if (source.v1 === '') return null
  if (source.v1 === target.code.v1 || source.v1 === target.label.v1) {
    return { score: TIER.exact, reason: 'EXACT' }
  }
  if (AUTOMATIC_SYNONYMS.get(target.code.v1)?.has(source.canonical)) {
    return { score: TIER.synonym, reason: 'SYNONYM' }
  }
  // A review-only synonym stays in the suggestion band, whatever else would match.
  if (REVIEW_SYNONYMS.get(target.code.v1)?.has(source.canonical)) {
    return { score: TIER.reviewSynonym, reason: 'SYNONYM_REVIEW' }
  }
  const byCode = similarity(source, target.code)
  const byLabel = similarity(source, target.label)
  if (!byCode) return byLabel
  if (!byLabel) return byCode
  return byLabel.score > byCode.score ? byLabel : byCode
}

function sampleText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > AUTO_SMART_V2_LIMITS.maxSampleCharacters ? null : value.trim()
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

const MONTHS = new Set([
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
])
const BOOLEAN_TOKENS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f', '1', '0'])

function dayMonthValid(first: number, second: number) {
  return first >= 1 && second >= 1 && first <= 31 && second <= 31 && (first <= 12 || second <= 12)
}

function looksLikeDate(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime())
  if (typeof value !== 'string') return false
  const text = value.trim().toLowerCase()
  const iso =
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?z?)?$/.exec(
      text,
    )
  if (iso) {
    const month = Number(iso[2])
    const day = Number(iso[3])
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
  }
  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text)
  if (numeric) return dayMonthValid(Number(numeric[1]), Number(numeric[2]))
  const dayFirst = /^(\d{1,2})[ -]([a-z]{3,9})\.?[ -]?,? ?(\d{4})$/.exec(text)
  if (dayFirst)
    return MONTHS.has(dayFirst[2]) && Number(dayFirst[1]) >= 1 && Number(dayFirst[1]) <= 31
  const monthFirst = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(text)
  if (monthFirst) {
    return MONTHS.has(monthFirst[1]) && Number(monthFirst[2]) >= 1 && Number(monthFirst[2]) <= 31
  }
  return false
}

function choiceParts(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    if (value.length > AUTO_SMART_V2_LIMITS.maxMultipleSelectParts) return null
    return value.every((item) => typeof item === 'string') ? (value as string[]) : null
  }
  const text = sampleText(value)
  if (text === null) return null
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      return Array.isArray(parsed) &&
        parsed.length <= AUTO_SMART_V2_LIMITS.maxMultipleSelectParts &&
        parsed.every((item) => typeof item === 'string')
        ? (parsed as string[])
        : null
    } catch {
      return null
    }
  }
  const parts = text
    .split(/[,;|]/, AUTO_SMART_V2_LIMITS.maxMultipleSelectParts + 1)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 && parts.length <= AUTO_SMART_V2_LIMITS.maxMultipleSelectParts
    ? parts
    : null
}

function compatible(value: unknown, target: PreparedField) {
  const field = target.field
  if (field.dataType === 'INTEGER') {
    if (typeof value === 'number') return Number.isSafeInteger(value)
    const text = sampleText(value)
    return text !== null && /^[+-]?(?:\d{1,15}|\d{1,3}(?:,\d{3}){1,4})(?:\.0+)?$/.test(text)
  }
  if (field.dataType === 'DECIMAL') {
    if (typeof value === 'number') return Number.isFinite(value)
    const text = sampleText(value)
    return (
      text !== null &&
      /\d/.test(text) &&
      /^[+-]?(?:\d{1,15}|\d{1,3}(?:,\d{3}){1,4})?(?:\.\d{1,10})?$/.test(text)
    )
  }
  if (field.dataType === 'DATE') return looksLikeDate(value)
  if (field.dataType === 'BOOLEAN') {
    if (typeof value === 'boolean') return true
    const text = sampleText(value)
    return text !== null && BOOLEAN_TOKENS.has(text.toLowerCase())
  }
  if (field.dataType === 'SELECT') {
    const text = sampleText(value)
    return text !== null && target.allowed.has(normalizeMappingNameV1(text))
  }
  if (field.dataType === 'MULTIPLE_SELECT') {
    const parts = choiceParts(value)
    return parts?.every((part) => target.allowed.has(normalizeMappingNameV1(part))) === true
  }
  const text = sampleText(value)
  if (text === null) return false
  const minimum = field.minimumLength ?? 1
  const maximum = field.maximumLength ?? (field.dataType === 'LONG_TEXT' ? 10_000 : 2_000)
  return text.length >= minimum && text.length <= maximum
}

/** The first samplesPerColumn non-blank values, scanning a bounded prefix only. */
function boundedSamples(samples: readonly unknown[]) {
  const result: unknown[] = []
  const scan = Math.min(samples.length, AUTO_SMART_V2_LIMITS.sampleRows)
  for (
    let index = 0;
    index < scan && result.length < AUTO_SMART_V2_LIMITS.samplesPerColumn;
    index++
  ) {
    if (!isBlank(samples[index])) result.push(samples[index])
  }
  return result
}

function valueGate(samples: readonly unknown[], target: PreparedField) {
  if (samples.length === 0) return 'NO_SAMPLES' as const
  let accepted = 0
  for (const sample of samples) if (compatible(sample, target)) accepted++
  return accepted * 100 >= AUTO_SMART_V2_LIMITS.valueGatePercent * samples.length
    ? ('PASS' as const)
    : ('FAIL' as const)
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

interface Candidate {
  fieldIndex: number
  score: number
  reason: SmartMatchReason
}

/**
 * Scores every column against every field and returns one decision per column in
 * column order. A field is auto-mapped by at most one column and suggested to at
 * most one other column; ties only ever produce suggestions.
 */
export function smartMatchColumns(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  if (
    columns.length > AUTO_SMART_V2_LIMITS.maxColumns ||
    fields.length > AUTO_SMART_V2_LIMITS.maxFields ||
    columns.some((column) => column.header.length > AUTO_SMART_V2_LIMITS.maxNameCharacters) ||
    fields.some(
      (field) =>
        field.code.length > AUTO_SMART_V2_LIMITS.maxNameCharacters ||
        field.label.length > AUTO_SMART_V2_LIMITS.maxNameCharacters ||
        (field.allowedValues?.length ?? 0) > 100,
    )
  ) {
    throw new SmartMatchInputError()
  }
  const orderedColumns = [...columns].sort(
    (left, right) => left.columnIndex - right.columnIndex || compareText(left.key, right.key),
  )
  const orderedFields: PreparedField[] = [...fields]
    .sort((left, right) => compareText(left.code, right.code) || compareText(left.id, right.id))
    .map((field) => ({
      field,
      code: prepareName(field.code),
      label: prepareName(field.label),
      allowed: new Set((field.allowedValues ?? []).map((value) => normalizeMappingNameV1(value))),
    }))

  // Candidates at or above the suggestion floor, best first; field order breaks ties.
  const candidates = orderedColumns.map((column) => {
    const source = prepareName(column.header)
    const scored: Candidate[] = []
    orderedFields.forEach((target, fieldIndex) => {
      const match = nameScore(source, target)
      if (match) scored.push({ fieldIndex, score: match.score, reason: match.reason })
    })
    scored.sort((left, right) => right.score - left.score || left.fieldIndex - right.fieldIndex)
    return { column, source, scored, samples: boundedSamples(column.samples) }
  })

  const bestScoreForField = new Map<number, number[]>()
  candidates.forEach((entry, columnPosition) => {
    for (const candidate of entry.scored) {
      const scores = bestScoreForField.get(candidate.fieldIndex) ?? []
      scores[columnPosition] = candidate.score
      bestScoreForField.set(candidate.fieldIndex, scores)
    }
  })

  const decisions: SmartMatchDecision[] = candidates.map(({ column }) => ({
    sourceKey: column.key,
    columnIndex: column.columnIndex,
    status: 'PENDING',
    targetFieldId: null,
    suggestedFieldId: null,
    score: null,
    matchReason: null,
    reason: 'NO_MATCH',
  }))
  const held = new Map<number, SmartDecisionReason>()
  const claimed = new Set<number>()

  candidates.forEach((entry, position) => {
    const decision = decisions[position]
    if (entry.source.v1 === '') {
      decision.reason = 'EMPTY_NAME'
      return
    }
    const best = entry.scored[0]
    if (!best || best.score < AUTO_SMART_V2_LIMITS.autoMapScore) return
    const next = entry.scored[1]?.score ?? 0
    const rivals = bestScoreForField.get(best.fieldIndex) ?? []
    const contested = rivals.some(
      (score, other) => other !== position && score !== undefined && score >= best.score,
    )
    const gate = valueGate(entry.samples, orderedFields[best.fieldIndex])
    if (contested) held.set(position, 'HELD_CONTESTED')
    else if (best.score - next < AUTO_SMART_V2_LIMITS.minimumMargin)
      held.set(position, 'HELD_MARGIN')
    else if (gate === 'NO_SAMPLES') held.set(position, 'HELD_NO_SAMPLES')
    else if (gate === 'FAIL') held.set(position, 'HELD_VALUE_GATE')
    else {
      decision.status = 'MAPPED'
      decision.targetFieldId = orderedFields[best.fieldIndex].field.id
      decision.score = best.score
      decision.matchReason = best.reason
      decision.reason = 'AUTO_MATCH'
      claimed.add(best.fieldIndex)
    }
  })

  // Suggestions: strongest first, then column order; each field at most once and
  // never a field another column already maps.
  const offers: Array<{ position: number; candidate: Candidate }> = []
  candidates.forEach((entry, position) => {
    if (decisions[position].status === 'MAPPED' || entry.source.v1 === '') return
    for (const candidate of entry.scored) offers.push({ position, candidate })
  })
  offers.sort(
    (left, right) =>
      right.candidate.score - left.candidate.score ||
      left.position - right.position ||
      left.candidate.fieldIndex - right.candidate.fieldIndex,
  )
  for (const { position, candidate } of offers) {
    const decision = decisions[position]
    if (decision.suggestedFieldId !== null || claimed.has(candidate.fieldIndex)) continue
    claimed.add(candidate.fieldIndex)
    decision.suggestedFieldId = orderedFields[candidate.fieldIndex].field.id
    decision.score = candidate.score
    decision.matchReason = candidate.reason
  }
  decisions.forEach((decision, position) => {
    if (decision.status === 'MAPPED' || decision.reason === 'EMPTY_NAME') return
    decision.reason =
      held.get(position) ?? (decision.suggestedFieldId !== null ? 'SUGGESTED' : 'NO_MATCH')
  })
  return decisions
}
