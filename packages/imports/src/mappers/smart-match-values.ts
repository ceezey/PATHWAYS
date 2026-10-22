import { type PreparedField, normalizeMappingNameV1 } from './smart-match-names'
import { AUTO_SMART_V2_LIMITS } from './smart-match-rules'

export function sampleText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > AUTO_SMART_V2_LIMITS.maxSampleCharacters ? null : value.trim()
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

export function isBlank(value: unknown) {
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

export function choiceParts(value: unknown): string[] | null {
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
    return (
      text !== null &&
      (target.allowed.has(normalizeMappingNameV1(text)) || target.resolve?.(text) != null)
    )
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

export function valueGate(samples: readonly unknown[], target: PreparedField) {
  if (samples.length === 0) return 'NO_SAMPLES' as const
  let accepted = 0
  for (const sample of samples) if (compatible(sample, target)) accepted++
  return accepted * 100 >= AUTO_SMART_V2_LIMITS.valueGatePercent * samples.length
    ? ('PASS' as const)
    : ('FAIL' as const)
}
