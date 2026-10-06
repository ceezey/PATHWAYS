import { type MetricCell, numericMetric } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rolePermissions } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { IndicatorsService } from '../indicators/indicators.service'
import { EvaluationMetricsService } from './evaluation-metrics'

const organizationId = '10000000-0000-4000-8000-00000000000a'
const project = {
  id: '20000000-0000-4000-8000-00000000000a',
  startDate: null,
  endDate: null,
  targetBeneficiaries: 10 as number | null,
}
const actorFor = (role: keyof typeof rolePermissions) =>
  ({
    organizationId,
    roles: [role],
    permissions: [...rolePermissions[role]],
  }) as unknown as ApplicationIdentity
const evaluator = actorFor('MONITORING_AND_EVALUATION_OFFICER')
const manager = actorFor('PROJECT_MANAGER')

const tx = {
  projectBudgetRecord: { findFirst: vi.fn() },
  budgetExpenseEntry: { aggregate: vi.fn() },
  projectActivity: { count: vi.fn() },
  $queryRaw: vi.fn(),
}
const readInTransaction = vi.fn()
const service = new EvaluationMetricsService({
  readInTransaction,
} as unknown as IndicatorsService)
const run = (
  type: 'KPI' | 'TIMELINE_COMPLIANCE' | 'BUDGET_EFFICIENCY' | 'BENEFICIARY_REACH',
  actor = evaluator,
  target = project,
) =>
  service
    .computeMany(tx as never, actor, target, '2026-06-30', [
      { id: 'c1', type, maximumScore: '100' },
    ])
    .then((rows) => rows.get('c1'))
const progress = (...values: string[]) => {
  readInTransaction.mockResolvedValue(
    values.map((value) => ({ progress: numericMetric(value) as MetricCell })),
  )
}
const enrolled = (count: number) => {
  tx.$queryRaw.mockResolvedValue([{ count }])
}

describe('computed evaluation criterion scores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progress('50')
    enrolled(10)
    tx.projectBudgetRecord.findFirst.mockResolvedValue({ plannedBudget: new Prisma.Decimal(100) })
    tx.budgetExpenseEntry.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(50) } })
    tx.projectActivity.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3)
  })

  it('scores KPI achievement and reports not computable without indicator progress', async () => {
    expect((await run('KPI'))?.score).toBe('50.0000')
    readInTransaction.mockResolvedValue([])
    const missing = await run('KPI')
    expect(missing?.score).toBeNull()
    expect(missing?.commentary).toContain('Not computable')
  })

  it('clamps an over-target KPI score and reads indicators once with a budget criterion', async () => {
    progress('150')
    const rows = await service.computeMany(tx as never, manager, project, '2026-06-30', [
      { id: 'k', type: 'KPI', maximumScore: '100' },
      { id: 'b', type: 'BUDGET_EFFICIENCY', maximumScore: '100' },
    ])
    expect(rows.get('k')?.score).toBe('100.0000')
    expect(readInTransaction).toHaveBeenCalledOnce()
  })

  it('scores budget efficiency for a role that can read budgets and clamps over 100 percent', async () => {
    progress('90')
    const result = await run('BUDGET_EFFICIENCY', manager)
    expect(result?.score).toBe('100.0000')
    expect(result?.commentary).toContain('clamped to 100%')
  })

  it('omits the clamp phrase when the efficiency ratio is already within range', async () => {
    tx.budgetExpenseEntry.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(80) } })
    progress('40')
    const result = await run('BUDGET_EFFICIENCY', manager)
    expect(result?.score).toBe('50.0000')
    expect(result?.commentary).not.toContain('clamped')
  })

  it('is not computable, and never reads budgets, when the role cannot read budgets', async () => {
    const result = await run('BUDGET_EFFICIENCY')
    expect(result?.score).toBeNull()
    expect(result?.commentary).toBe(
      'Not computable: budget data is not visible to the evaluating role; enter a manual score and note.',
    )
    expect(tx.projectBudgetRecord.findFirst).not.toHaveBeenCalled()
  })

  it('is not computable when no planned budget exists or spending is zero-denominated', async () => {
    tx.projectBudgetRecord.findFirst.mockResolvedValue(null)
    expect((await run('BUDGET_EFFICIENCY', manager))?.score).toBeNull()
  })

  it('scores timeline delivery over non-archived due activities only', async () => {
    const result = await run('TIMELINE_COMPLIANCE')
    expect(result?.score).toBe('75.0000')
    expect(result?.commentary).not.toContain('clamped')
    expect(tx.projectActivity.count.mock.calls[0][0].where).toMatchObject({ archivedAt: null })
  })

  it('is not computable when no activity is due by the period end', async () => {
    tx.projectActivity.count.mockReset().mockResolvedValue(0)
    expect((await run('TIMELINE_COMPLIANCE'))?.score).toBeNull()
  })

  it('is not computable without a target beneficiary count', async () => {
    expect(
      (await run('BENEFICIARY_REACH', evaluator, { ...project, targetBeneficiaries: null }))?.score,
    ).toBeNull()
  })

  it.each([
    [0, '0.0000', '0 of 10 target beneficiaries enrolled'],
    [5, '50.0000', '5 of 10 target beneficiaries enrolled'],
    [12, '100.0000', 'clamped to 100%'],
  ])('scores %i enrolled beneficiaries', async (count, score, text) => {
    enrolled(count)
    const result = await run('BENEFICIARY_REACH')
    expect(result?.score).toBe(score)
    expect(result?.commentary).toContain(text)
  })

  it.each([1, 4])('suppresses a small enrolled count of %i everywhere', async (count) => {
    enrolled(count)
    const result = await run('BENEFICIARY_REACH')
    expect(result).toEqual({
      score: null,
      commentary: 'Not computable: enrolled count is below the small-cell threshold.',
    })
  })
})
