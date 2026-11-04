import { type PreparedField, normalizeMappingNameV1 } from './smart-match-names'
import { AUTO_SMART_V2_LIMITS } from './smart-match-rules'

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

/** The choices in a multi-select cell: a JSON array, else a split on comma, semicolon or pipe. */
export function splitChoiceText(value: unknown): string[] | null {
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

/**
 * The answers validation reads from a multi-select cell: an array, a JSON array or delimited text.
 * A single part splits on spaces, as Kobo writes several choices, only when it does not resolve
 * whole and every token does.
 */
export function choiceAnswers(raw: unknown, resolve: (raw: string) => unknown): string[] | null {
  if (Array.isArray(raw)) return raw.every((item) => typeof item === 'string') ? raw : null
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {
    // Not a JSON array: read it as delimited text below.
  }
  const parts = splitChoiceText(raw)
  if (parts?.length !== 1 || resolve(parts[0])) return parts
  const tokens = parts[0].split(/\s+/)
  return tokens.length > 1 && tokens.every((token) => resolve(token)) ? tokens : parts
}

type ValueTarget = Pick<PreparedField, 'field' | 'allowed' | 'resolve'>

function compatible(value: unknown, target: ValueTarget, spaced: boolean) {
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
    return (
      text !== null &&
      (target.allowed.has(normalizeMappingNameV1(text)) || target.resolve?.(text) != null)
    )
  }
  if (field.dataType === 'MULTIPLE_SELECT') {
    const parts = splitChoiceText(value)
    const allowed = (part: string) =>
      target.allowed.has(normalizeMappingNameV1(part)) || target.resolve?.(part) != null
    // V4 reads a text cell as validation does, so Kobo's space-separated codes pass too.
    const answers =
      spaced && parts && typeof value === 'string' ? choiceAnswers(value, allowed) : parts
    return answers?.every(allowed) ?? false
  }
  const text = sampleText(value)
  if (text === null) return false
  const minimum = field.minimumLength ?? 1
  const maximum = field.maximumLength ?? (field.dataType === 'LONG_TEXT' ? 10_000 : 2_000)
  return text.length >= minimum && text.length <= maximum
}

/** The first samplesPerColumn non-blank values, scanning a bounded prefix only. */
export function boundedSamples(samples: readonly unknown[]) {
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

/** Whether the samples fit the field; `spaced` (V4) also reads Kobo's space-separated choices. */
export function valueGate(samples: readonly unknown[], target: ValueTarget, spaced = false) {
  if (samples.length === 0) return 'NO_SAMPLES' as const
  let accepted = 0
  for (const sample of samples) if (compatible(sample, target, spaced)) accepted++
  return accepted * 100 >= AUTO_SMART_V2_LIMITS.valueGatePercent * samples.length
    ? ('PASS' as const)
    : ('FAIL' as const)
}
