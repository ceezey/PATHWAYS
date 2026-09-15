import { describe, expect, it } from 'vitest'
import {
  businessCalendarDate,
  createIndicatorSchema,
  dashboardQuerySchema,
  indicatorProgress,
  isCalendarDate,
  manualMeasurementSchema,
  metricCellSchema,
  normalizeMetricDecimal,
  numericMetric,
  sadddAgeBands,
  validateMetricPeriod,
} from './metric-contract'

const definition = {
  code: 'TRAINING_2026',
  name: 'Training participation',
  unitLabel: 'records',
  dataSource: 'Reviewed activity records',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  baseline: '10',
  target: '30',
} as const

describe('P06 exact numeric and missing-value contracts', () => {
  it.each([
    ['0', 'COUNT', '0'],
    ['12.0000', 'COUNT', '12'],
    ['-12.3456', 'SIGNED_CHANGE', '-12.3456'],
    ['100', 'PERCENTAGE', '100'],
    ['2.75', 'RATIO', '2.75'],
    ['99999999999999.9999', 'NON_NEGATIVE', '99999999999999.9999'],
  ] as const)('normalizes %s in %s without a floating-point authority', (input, kind, output) => {
    expect(normalizeMetricDecimal(input, kind)).toBe(output)
  })
  it.each([
    ['-1', 'COUNT'],
    ['1.5', 'COUNT'],
    ['100.0001', 'PERCENTAGE'],
    ['-0.1', 'RATIO'],
    ['1e2', 'SIGNED_CHANGE'],
    ['NaN', 'SIGNED_CHANGE'],
    ['1.12345', 'SIGNED_CHANGE'],
    ['100000000000000', 'NON_NEGATIVE'],
    ['01', 'COUNT'],
  ] as const)('rejects %s in %s', (input, kind) =>
    expect(() => normalizeMetricDecimal(input, kind)).toThrow(),
  )
  it('uses baseline-to-target change, including lower-is-better and signed measures', () => {
    expect(indicatorProgress(numericMetric('20'), '10', '30', 'HIGHER_IS_BETTER').value).toBe('50')
    expect(indicatorProgress(numericMetric('8'), '12', '4', 'LOWER_IS_BETTER').value).toBe('50')
    expect(indicatorProgress(numericMetric('-2'), '-10', '6', 'HIGHER_IS_BETTER').value).toBe('50')
    expect(indicatorProgress(numericMetric('40'), '10', '30', 'HIGHER_IS_BETTER').value).toBe('150')
    expect(indicatorProgress(numericMetric('0'), '10', '30', 'HIGHER_IS_BETTER').value).toBe('-50')
  })
  it('never substitutes missing, suppressed or zero-denominator values with zero', () => {
    expect(indicatorProgress(numericMetric('5'), '5', '5', 'HIGHER_IS_BETTER')).toMatchObject({
      state: 'NOT_APPLICABLE',
      value: null,
      reason: 'ZERO_DENOMINATOR',
    })
    expect(
      indicatorProgress(
        { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
        '0',
        '10',
        'HIGHER_IS_BETTER',
      ).value,
    ).toBeNull()
    expect(
      indicatorProgress(
        { state: 'SUPPRESSED', value: null, reason: 'SMALL_COHORT' },
        '0',
        '10',
        'HIGHER_IS_BETTER',
      ).state,
    ).toBe('SUPPRESSED')
    expect(
      metricCellSchema.safeParse({ state: 'SUPPRESSED', value: '2', reason: 'SMALL_COHORT' })
        .success,
    ).toBe(false)
    expect(
      metricCellSchema.safeParse({ state: 'MISSING', value: '0', reason: 'NO_MEASUREMENT' })
        .success,
    ).toBe(false)
    expect(numericMetric('0').state).toBe('ZERO')
  })
})

describe('P06 definition and filter allowlists', () => {
  it('requires one value authority and a valid recipe-domain pair', () => {
    expect(createIndicatorSchema.safeParse(definition).success).toBe(true)
    expect(createIndicatorSchema.safeParse({ ...definition, mode: 'DERIVED' }).success).toBe(false)
    expect(
      createIndicatorSchema.safeParse({
        ...definition,
        binding: { recipe: 'PARTICIPATION_RECORD_COUNT' },
      }).success,
    ).toBe(false)
    expect(
      createIndicatorSchema.safeParse({
        ...definition,
        mode: 'DERIVED',
        binding: { recipe: 'ATTENDANCE_RECORDS_PER_INDIVIDUAL' },
      }).success,
    ).toBe(false)
    expect(
      createIndicatorSchema.safeParse({
        ...definition,
        mode: 'DERIVED',
        numericKind: 'RATIO',
        binding: { recipe: 'ATTENDANCE_RECORDS_PER_INDIVIDUAL' },
      }).success,
    ).toBe(true)
  })
  it('rejects arbitrary formulas, role overrides, organization scope and unapproved cross-filters', () => {
    for (const key of [
      'formula',
      'sql',
      'organizationId',
      'role',
      'createdById',
      'actualValue',
      'currentValue',
    ]) {
      expect(createIndicatorSchema.safeParse({ ...definition, [key]: 'not-allowed' }).success).toBe(
        false,
      )
    }
    for (const key of [
      'sex',
      'ageBand',
      'disability',
      'location',
      'activityId',
      'beneficiaryId',
      'role',
    ]) {
      expect(dashboardQuerySchema.safeParse({ [key]: 'not-allowed' }).success).toBe(false)
    }
    expect(dashboardQuerySchema.safeParse({ periodEnd: '2026-06-30' }).success).toBe(false)
  })
  it('pins form metrics to an explicit version and numeric field identifier', () => {
    const derived = {
      ...definition,
      mode: 'DERIVED',
      binding: {
        recipe: 'FORM_NUMERIC_SUM',
        formId: '77000000-0000-4000-8000-000000000001',
        fieldId: '77000000-0000-4000-8000-000000000002',
      },
    }
    expect(createIndicatorSchema.safeParse(derived).success).toBe(false)
    expect(
      createIndicatorSchema.safeParse({
        ...derived,
        binding: { ...derived.binding, formVersion: 2 },
      }).success,
    ).toBe(true)
  })
  it('requires correction provenance and a client idempotency key', () => {
    const value = {
      clientMeasurementId: '77000000-0000-4000-8000-000000000001',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      value: '2',
      source: 'Verified source',
    }
    expect(manualMeasurementSchema.safeParse(value).success).toBe(true)
    expect(
      manualMeasurementSchema.safeParse({
        ...value,
        correctsMeasurementId: '77000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false)
  })
})

describe('P06 calendar bounds and confirmed G4 labels', () => {
  it('uses the configured business calendar at the UTC date boundary', () => {
    expect(businessCalendarDate(new Date('2026-06-30T16:30:00Z'), 'Asia/Manila')).toBe('2026-07-01')
    expect(businessCalendarDate(new Date('2026-06-30T16:30:00Z'), 'UTC')).toBe('2026-06-30')
    expect(() => businessCalendarDate(new Date(), 'Not/AZone')).toThrow()
  })
  it('bounds inclusive periods and rejects impossible dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-06-31')).toBe(false)
    expect(() => validateMetricPeriod('2024-01-01', '2024-12-31')).not.toThrow()
    expect(() => validateMetricPeriod('2024-01-01', '2025-01-01')).toThrow()
    expect(() => validateMetricPeriod('2026-06-30', '2026-06-01')).toThrow()
    expect(sadddAgeBands).toEqual(['0-9', '10-14', '15-17', '18-24', '25+', 'Unknown'])
  })
})
