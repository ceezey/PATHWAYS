import 'reflect-metadata'

import { publicAnalyticsResponse } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { PublicAnalyticsService } from './public-analytics.service'

const projectId = '20000000-0000-4000-8000-000000000002'
const queryRaw = vi.fn()
const service = new PublicAnalyticsService({ $queryRaw: queryRaw } as unknown as PrismaService)

const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
const bucket = (key: string, value: string) => ({ key, label: key, metric: cell(value) })
const sql = (data: unknown) => queryRaw.mockResolvedValue([{ data }])

const indicator = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId,
  code: 'REACH',
  name: 'People reached',
  indicatorType: 'OUTPUT',
  unitLabel: 'people',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  baseline: '0',
  target: '100',
  revision: 1,
  status: 'ACTIVE',
  current: cell('40'),
}
const activity = { activityId: '40000000-0000-4000-8000-000000000004', activityName: 'Training' }
const participation = {
  projectId,
  total: 2,
  totalSuppressed: false,
  byActivity: [{ ...activity, count: 2, suppressed: false }],
  byMonth: [{ month: '2026-03', count: 2, suppressed: false }],
  byAttendanceStatus: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'].map(
    (status) => ({ status, count: status === 'PRESENT' ? 2 : 0, suppressed: false }),
  ),
}
const timeline = {
  project: { status: 'ONGOING', startDate: '2026-01-01', endDate: '2026-12-31' },
  aggregate: {
    activities: { eligible: 2, completed: 1, overdue: 0, missingDates: 0, maxOverdueDays: null },
    milestones: { completed: 0, rated: 0, onTime: 0 },
  },
  lastCompletion: null,
}
const towns = [
  {
    town: 'Cebu City',
    province: 'Cebu',
    total: 3,
    disability: 1,
    sex: [{ key: 'MALE', label: 'Male', n: 3 }],
  },
]

beforeEach(() => vi.clearAllMocks())

describe('public analytics', () => {
  it.each([
    ['kpi', [indicator], 'indicators'],
    ['saddd', { total: cell('5'), sex: [bucket('MALE', '5')], age: [], disability: [] }, 'total'],
    ['participation', participation, 'byMonth'],
    ['timeline', timeline, 'elapsedPercent'],
    ['map', { area: 'Cebu City', towns }, 'places'],
  ])('the %s view parses against its schema', async (view, data, key) => {
    sql(data)
    const body = await service.read(projectId, view)
    expect(publicAnalyticsResponse.parse(body)).toMatchObject({ view })
    expect(body).toHaveProperty(key)
  })

  it('kpi drops definition text and measurement provenance', async () => {
    sql([indicator])
    const body = await service.read(projectId, 'kpi')
    expect(body).toMatchObject({
      indicators: [{ code: 'REACH', description: null, binding: null, measurementId: null }],
    })
  })

  it('map maps area to places with reach and no overview', async () => {
    sql({ area: 'Cebu City', towns })
    const body = await service.read(projectId, 'map')
    expect(body).toMatchObject({
      view: 'map',
      places: [{ name: 'Cebu City', province: 'Cebu', reach: { total: { value: '3' } } }],
    })
    expect(JSON.stringify(body)).not.toMatch(/overview|budget/i)
    expect(Object.keys(body).sort()).toEqual(['places', 'view'])
  })

  it('unknown view 404 before any query', async () => {
    await expect(service.read(projectId, 'budget')).rejects.toMatchObject({
      status: 404,
      message: 'View unavailable.',
    })
    await expect(service.read('nope', 'kpi')).rejects.toMatchObject({ status: 404 })
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('sql null gives 404', async () => {
    sql(null)
    await expect(service.read(projectId, 'kpi')).rejects.toMatchObject({
      status: 404,
      message: 'View unavailable.',
    })
  })

  it('sql error gives 503 with a fixed message', async () => {
    queryRaw.mockRejectedValue(new Error('relation secret_table does not exist'))
    await expect(service.read(projectId, 'saddd')).rejects.toMatchObject({
      status: 503,
      message: 'Public analytics are temporarily unavailable.',
    })
  })

  it('a payload that breaks its schema gives 503', async () => {
    sql({ total: 'x' })
    await expect(service.read(projectId, 'saddd')).rejects.toMatchObject({ status: 503 })
  })

  it('reads the live view on every call', async () => {
    sql({ total: cell('5'), sex: [], age: [], disability: [] })
    await service.read(projectId, 'saddd')
    sql(null)
    await expect(service.read(projectId, 'saddd')).rejects.toMatchObject({ status: 404 })
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
