import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES,
  budgetSummarySchema,
  indicatorTrendsSchema,
  participationBreakdownSchema,
} from './analytics-insights'

const projectId = '20000000-0000-4000-8000-00000000000a'
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const cell = { count: 6, suppressed: false }
const statuses = ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES.map((status) => ({ status, ...cell }))
const participation = (patch: object = {}) => ({
  projectId,
  total: 30,
  totalSuppressed: false,
  byActivity: [{ activityId: id(1), activityName: 'A', ...cell }],
  byMonth: [{ month: '2026-01', ...cell }],
  byAttendanceStatus: statuses,
  ...patch,
})
const okParticipation = (patch: object) =>
  participationBreakdownSchema.safeParse(participation(patch)).success
const point = (periodStart: string, periodEnd: string, value = 1) => ({
  periodStart,
  periodEnd,
  value,
})
const indicator = (n: number, patch: object = {}) => ({
  indicatorId: id(n),
  name: `I${n}`,
  unit: 'people',
  target: 10,
  points: [point('2026-01-01', '2026-01-31')],
  ...patch,
})
const okTrends = (indicators: unknown[]) =>
  indicatorTrendsSchema.safeParse({ projectId, indicators }).success
const currency = (code: string, patch: object = {}) => ({
  currency: code,
  planned: 100,
  approved: 40,
  pending: 10,
  utilizationPercent: 40,
  ...patch,
})
const okBudget = (currencies: unknown[]) =>
  budgetSummarySchema.safeParse({ projectId, currencies }).success

describe('participation breakdown schema', () => {
  it('accepts a well-formed breakdown', () => {
    expect(okParticipation({})).toBe(true)
  })
  it.each(['2026-00', '2026-13', '2026-1', '26-01'])('rejects month %s', (month) => {
    expect(okParticipation({ byMonth: [{ month, ...cell }] })).toBe(false)
  })
  it('rejects unordered or repeated months', () => {
    const rows = (...months: string[]) => months.map((month) => ({ month, ...cell }))
    expect(okParticipation({ byMonth: rows('2026-02', '2026-01') })).toBe(false)
    expect(okParticipation({ byMonth: rows('2026-01', '2026-01') })).toBe(false)
  })
  it('rejects duplicate activities and over-long lists', () => {
    const row = { activityId: id(1), activityName: 'A', ...cell }
    expect(okParticipation({ byActivity: [row, row] })).toBe(false)
    const many = Array.from({ length: 1001 }, (_, n) => ({ ...row, activityId: id(n + 1) }))
    expect(okParticipation({ byActivity: many })).toBe(false)
    const months = Array.from({ length: 1201 }, (_, n) => ({
      month: `${1000 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`,
      ...cell,
    }))
    expect(okParticipation({ byMonth: months })).toBe(false)
  })
  it('requires exactly one row per attendance status', () => {
    expect(okParticipation({ byAttendanceStatus: statuses.slice(1) })).toBe(false)
    expect(okParticipation({ byAttendanceStatus: [...statuses, statuses[0]] })).toBe(false)
    expect(okParticipation({ byAttendanceStatus: [...statuses.slice(1), statuses[1]] })).toBe(false)
  })
})

describe('indicator trends schema', () => {
  it('accepts well-formed trends', () => {
    expect(okTrends([indicator(1), indicator(2)])).toBe(true)
  })
  it('rejects non-finite numbers', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(okTrends([indicator(1, { target: bad })])).toBe(false)
      expect(okTrends([indicator(1, { points: [point('2026-01-01', '2026-01-31', bad)] })])).toBe(
        false,
      )
    }
  })
  it('rejects a reversed point period and unordered points', () => {
    expect(okTrends([indicator(1, { points: [point('2026-02-01', '2026-01-01')] })])).toBe(false)
    const unordered = [point('2026-02-01', '2026-02-28'), point('2026-01-01', '2026-01-31')]
    expect(okTrends([indicator(1, { points: unordered })])).toBe(false)
  })
  it('rejects duplicate indicators and over-long lists', () => {
    expect(okTrends([indicator(1), indicator(1)])).toBe(false)
    expect(okTrends(Array.from({ length: 51 }, (_, n) => indicator(n + 1)))).toBe(false)
    const points = Array.from({ length: 121 }, () => point('2026-01-01', '2026-01-31'))
    expect(okTrends([indicator(1, { points })])).toBe(false)
  })
})

describe('budget summary schema', () => {
  it('accepts a null utilization and well-formed currencies', () => {
    expect(okBudget([currency('USD'), currency('EUR', { utilizationPercent: null })])).toBe(true)
  })
  it.each(['planned', 'approved', 'pending', 'utilizationPercent'])('rejects bad %s', (key) => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(okBudget([currency('USD', { [key]: bad })])).toBe(false)
  })
  it('rejects duplicate currencies and over-long lists', () => {
    expect(okBudget([currency('USD'), currency('USD')])).toBe(false)
    expect(
      okBudget(Array.from({ length: 51 }, (_, n) => currency(`A${String(n).padStart(2, '0')}`))),
    ).toBe(false)
  })
})
