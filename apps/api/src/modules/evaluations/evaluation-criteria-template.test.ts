import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../auth/developer-access'
import { defaultCriteria, provisionCriteria } from './evaluation-criteria-template'

const actor = {
  organizationId: '10000000-0000-4000-8000-00000000000a',
  userId: '20000000-0000-4000-8000-00000000000b',
} as ApplicationIdentity
const projectId = '30000000-0000-4000-8000-00000000000c'
const tx = {
  $queryRaw: vi.fn(),
  projectEvaluationCriterion: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}
const provision = () => provisionCriteria(tx as never, actor, projectId)
const row = (overrides: Record<string, unknown>) => ({
  id: `row-${Math.random()}`,
  code: 'OLD',
  version: 1,
  type: 'OTHER',
  status: 'PUBLISHED',
  archivedAt: null,
  weightPercentage: new Prisma.Decimal(100),
  maximumScore: new Prisma.Decimal(100),
  ...overrides,
})
const current = defaultCriteria.map((want) =>
  row({
    code: want.code,
    type: want.type,
    weightPercentage: new Prisma.Decimal(want.weight),
  }),
)

describe('default evaluation criteria', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.projectEvaluationCriterion.create.mockResolvedValue({ id: 'new' })
  })

  it('totals 100 percent over six unique codes', () => {
    expect(defaultCriteria.reduce((sum, row) => sum + row.weight, 0)).toBe(100)
    expect(new Set(defaultCriteria.map((row) => row.code)).size).toBe(6)
  })

  it('leaves an already provisioned set untouched', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue(current)
    await provision()
    expect(tx.projectEvaluationCriterion.create).not.toHaveBeenCalled()
    expect(tx.projectEvaluationCriterion.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('creates and publishes the set for a project without criteria', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([])
    await provision()
    expect(tx.projectEvaluationCriterion.create).toHaveBeenCalledTimes(6)
    expect(tx.projectEvaluationCriterion.create.mock.calls[0][0].data).toMatchObject({
      status: 'DRAFT',
      version: 1,
    })
    expect(tx.projectEvaluationCriterion.update).toHaveBeenCalledTimes(6)
    expect(tx.projectEvaluationCriterion.update.mock.calls[0][0].data).toMatchObject({
      status: 'PUBLISHED',
      publishedById: actor.userId,
    })
  })

  it('archives a different published set and publishes the template at the next version', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([
      row({ id: 'old-published' }),
      row({ id: 'old-reach', code: 'RELEVANCE', version: 2 }),
    ])
    await provision()
    const updates = tx.projectEvaluationCriterion.update.mock.calls.map(([call]) => call)
    expect(updates[0]).toMatchObject({
      where: { id: 'old-published' },
      data: { status: 'ARCHIVED' },
    })
    const relevance = tx.projectEvaluationCriterion.create.mock.calls
      .map(([call]) => call.data)
      .find((data) => data.code === 'RELEVANCE')
    expect(relevance.version).toBe(3)
  })

  it('publishes then archives a legacy draft because a draft cannot be archived directly', async () => {
    tx.projectEvaluationCriterion.findMany.mockResolvedValue([
      row({ id: 'old-draft', status: 'DRAFT' }),
    ])
    await provision()
    const updates = tx.projectEvaluationCriterion.update.mock.calls.map(([call]) => call)
    expect(updates[0].data).toMatchObject({ status: 'PUBLISHED' })
    expect(updates[1].data).toMatchObject({ status: 'ARCHIVED' })
  })
})
