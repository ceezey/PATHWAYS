/** P06 exact arithmetic. JSON carries decimal strings, never floating-point measurements. */
export const numericKinds = ['COUNT', 'SIGNED_CHANGE', 'PERCENTAGE', 'RATIO', 'NON_NEGATIVE'] as const
export type NumericKind = (typeof numericKinds)[number]
export type MetricDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'DESCRIPTIVE'
export type MetricState = 'AVAILABLE' | 'ZERO' | 'MISSING' | 'NOT_APPLICABLE' | 'SUPPRESSED'
export type MetricCell = {
  state: MetricState
  value: string | null
  reason: string | null
}
const scale = 10000n
const limit = 999999999999999999n

export function scaledDecimal(input: string): bigint {
  if (typeof input !== 'string' || !/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(input)) {
    throw new Error('Use a plain decimal with at most 14 integer and 4 fractional digits.')
  }
  const negative = input.startsWith('-')
  const [whole, fraction = ''] = (negative ? input.slice(1) : input).split('.')
  const value = BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'))
  if (value > limit) throw new Error('Measurement exceeds decimal(18,4).')
  return negative ? -value : value
}

export function decimalString(value: bigint): string {
  const absolute = value < 0n ? -value : value
  const fraction = (absolute % scale).toString().padStart(4, '0').replace(/0+$/, '')
  return `${value < 0n ? '-' : ''}${absolute / scale}${fraction ? `.${fraction}` : ''}`
}

export function normalizeMetricDecimal(value: string, kind: NumericKind): string {
  const scaled = scaledDecimal(value)
  if (kind !== 'SIGNED_CHANGE' && scaled < 0n) throw new Error('This metric cannot be negative.')
  if (kind === 'COUNT' && scaled % scale !== 0n) throw new Error('Counts must be whole numbers.')
  if (kind === 'PERCENTAGE' && scaled > 100n * scale) {
    throw new Error('Percentages must be between 0 and 100. Use RATIO for uncapped ratios.')
  }
  return decimalString(scaled)
}

/** Round once, to four places, half away from zero. Denominator must be non-zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Zero denominator.')
  const negative = (numerator < 0n) !== (denominator < 0n)
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const value = n / d + ((n % d) * 2n >= d ? 1n : 0n)
  return negative ? -value : value
}

export function missingMetric(reason = 'NO_MEASUREMENT'): MetricCell {
  return { state: 'MISSING', value: null, reason }
}
export function numericMetric(value: string): MetricCell {
  const normalized = decimalString(scaledDecimal(value))
  return { state: normalized === '0' ? 'ZERO' : 'AVAILABLE', value: normalized, reason: null }
}

/** Baseline-to-target movement, not a success rating. Never clamp negative or >100 results. */
export function indicatorProgress(
  actual: MetricCell,
  baseline: string | null,
  target: string | null,
  direction: MetricDirection,
): MetricCell {
  if (actual.state === 'SUPPRESSED' || actual.state === 'NOT_APPLICABLE') return { ...actual }
  if (actual.value === null) return missingMetric(actual.reason ?? 'NO_MEASUREMENT')
  if (direction === 'DESCRIPTIVE' || target === null || baseline === null) {
    return { state: 'NOT_APPLICABLE', value: null, reason: 'BASELINE_TARGET_DIRECTION_REQUIRED' }
  }
  const b = scaledDecimal(baseline)
  const t = scaledDecimal(target)
  const delta = t - b
  if (delta === 0n) return { state: 'NOT_APPLICABLE', value: null, reason: 'ZERO_DENOMINATOR' }
  if ((direction === 'HIGHER_IS_BETTER' && delta < 0n) || (direction === 'LOWER_IS_BETTER' && delta > 0n)) {
    return { state: 'NOT_APPLICABLE', value: null, reason: 'DIRECTION_CONFLICT' }
  }
  const numerator = (scaledDecimal(actual.value) - b) * 100n * scale
  const result = divideRounded(numerator, delta)
  if (numerator !== 0n && result === 0n) return missingMetric('BELOW_REPRESENTABLE_PRECISION')
  // Progress can exceed the measurement domain; only the API decimal representation is bounded.
  if (result > limit || result < -limit) return missingMetric('PROGRESS_OUT_OF_RANGE')
  return numericMetric(decimalString(result))
}

export function isCalendarDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  if (value < '1900-01-01' || value > '2100-12-31') return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
export function businessCalendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function validateMetricPeriod(start: string, end: string): void {
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) {
    throw new Error('An ordered pair of real YYYY-MM-DD calendar dates is required.')
  }
  if ((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 > 365) {
    throw new Error('A monitoring query may cover at most 366 inclusive calendar days.')
  }
}
