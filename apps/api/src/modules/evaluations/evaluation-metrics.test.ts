import { type MetricCell, numericMetric } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rolePermissions } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { IndicatorsService } from '../indicators/indicators.service'
import { type CriterionType, EvaluationMetricsService } from './evaluation-metrics'

const organizationId = '10000000-0000-4000-8000-00000000000a'
const project = {
  id: '20000000-0000-4000-8000-00000000000a',
  targetBeneficiaries: 10 as number | null,
}
const evaluator = {
  organizationId,
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [...rolePermissions.MONITORING_AND_EVALUATION_OFFICER],
} as unknown as ApplicationIdentity
const period = { start: '2026-01-01', end: '2026-06-30' }

const tx = { projectActivity: { count: vi.fn() }, $queryRaw: vi.fn() }
const readInTransaction = vi.fn()
const service = new EvaluationMetricsService({ readInTransaction } as unknown as IndicatorsService)
const run = (type: CriterionType, target = project) =>
  service
    .computeMany(tx as never, evaluator, target, period, [{ id: 'c1', type, maximumScore: '100' }])
    .then((rows) => rows.get('c1'))
const progress = (...values: string[]) => {
  readInTransaction.mockResolvedValue(
    values.map((value) => ({ progress: numericMetric(value) as MetricCell })),
  )
}
const cell = (count: string) =>
  `the ${count} count is below the small-cell reporting threshold (fewer than 5)`
const noData = (reason: string) => ({ score: '0.0000', commentary: `No data: ${reason}` })

describe('automatic evaluation criterion scores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progress('50')
  })

  it('scores KPI achievement with its evidence and labels missing progress as no data', async () => {
    expect(await run('KPI')).toEqual({ score: '50.0000', commentary: 'KPI achievement 50%' })
    readInTransaction.mockResolvedValue([])
    expect(await run('KPI')).toEqual(
      noData('no indicator progress is reported (0 of 0 project indicators reporting)'),
    )
  })

  it('caps an over-target KPI score at 100 and reads indicators once for two KPI criteria', async () => {
    progress('150')
    const rows = await service.computeMany(tx as never, evaluator, project, period, [
      { id: 'a', type: 'KPI', maximumScore: '100' },
      { id: 'b', type: 'KPI', maximumScore: '100' },
    ])
    expect(rows.get('a')).toEqual({
      score: '100.0000',
      commentary: 'KPI achievement 150%, capped at 100%',
    })
    expect(rows.get('b')?.score).toBe('100.0000')
    expect(readInTransaction).toHaveBeenCalledOnce()
  })

  it('scores timeline delivery over non-archived due activities only', async () => {
    tx.projectActivity.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3)
    expect(await run('TIMELINE_COMPLIANCE')).toEqual({
      score: '75.0000',
      commentary: '3 of 4 due activities done',
    })
    expect(tx.projectActivity.count.mock.calls[0][0].where).toMatchObject({ archivedAt: null })
  })

  it('labels a timeline with nothing due as no data', async () => {
    tx.projectActivity.count.mockResolvedValue(0)
    expect(await run('TIMELINE_COMPLIANCE')).toEqual(noData('no activity is due by the period end'))
  })

  it('scores indicator linkage as the share of live activities linked', async () => {
    tx.projectActivity.count.mockResolvedValueOnce(6).mockResolvedValueOnce(4)
    expect(await run('INDICATOR_LINKAGE')).toEqual({
      score: '66.6667',
      commentary: '4 of 6 activities linked',
    })
    expect(tx.projectActivity.count.mock.calls[1][0].where).toMatchObject({
      activityIndicatorLink_activity: { some: { indicator: { archivedAt: null } } },
    })
  })

  it('labels a project without activities as no data for linkage', async () => {
    tx.projectActivity.count.mockResolvedValue(0)
    expect(await run('INDICATOR_LINKAGE')).toEqual(noData('the project has no activities'))
  })

  it('labels a project without a target as no data for reach', async () => {
    expect(await run('BENEFICIARY_REACH', { ...project, targetBeneficiaries: null })).toEqual(
      noData('the project has no target beneficiary count'),
    )
  })

  it.each([
    [0, '0.0000', 'Reach 0% of target'],
    [5, '50.0000', 'Reach 50% of target'],
    [12, '100.0000', 'Reach 120% of target, capped at 100%'],
  ])('scores %i enrolled beneficiaries for reach', async (count, score, text) => {
    tx.$queryRaw.mockResolvedValue([{ count }])
    expect(await run('BENEFICIARY_REACH')).toEqual({ score, commentary: text })
  })

  it.each([1, 4])('suppresses a small enrolled count of %i', async (count) => {
    tx.$queryRaw.mockResolvedValue([{ count }])
    expect(await run('BENEFICIARY_REACH')).toEqual(noData(`${cell('enrolled')}`))
  })

  it('scores assessment gain as the share of paired assessments that improved', async () => {
    tx.$queryRaw.mockResolvedValue([{ pairs: 24, improved: 18 }])
    expect(await run('ASSESSMENT_GAIN')).toEqual({
      score: '75.0000',
      commentary: 'Improved in 18 of 24 paired assessments',
    })
    expect(tx.$queryRaw.mock.calls[0]).toContain(period.start)
  })

  it('labels missing or suppressed paired assessments as no data', async () => {
    tx.$queryRaw.mockResolvedValue([{ pairs: 0, improved: 0 }])
    expect(await run('ASSESSMENT_GAIN')).toEqual(
      noData('no paired pre/post assessments in the period'),
    )
    tx.$queryRaw.mockResolvedValue([{ pairs: 3, improved: 2 }])
    expect(await run('ASSESSMENT_GAIN')).toEqual(noData(cell('paired assessment')))
  })

  it.each([
    [6, 5, noData(cell('not-improved assessment'))],
    [6, 1, noData(cell('improved assessment'))],
    [10, 5, { score: '50.0000', commentary: 'Improved in 5 of 10 paired assessments' }],
    [5, 5, { score: '100.0000', commentary: 'Improved in 5 of 5 paired assessments' }],
    [5, 0, { score: '0.0000', commentary: 'Improved in 0 of 5 paired assessments' }],
  ])(
    'small-cell checks improved and not-improved counts for %i pairs, %i improved',
    async (pairs, improved, expected) => {
      tx.$queryRaw.mockResolvedValue([{ pairs, improved }])
      expect(await run('ASSESSMENT_GAIN')).toEqual(expected)
    },
  )

  it.each(['OTHER', 'BUDGET_EFFICIENCY'] as const)(
    'scores the retired %s criterion 0 with a reason so old rounds can still be submitted',
    async (type) => {
      expect(await run(type)).toEqual(noData('criterion is no longer scored automatically'))
    },
  )
})
