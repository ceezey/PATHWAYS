import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesHumanService } from './rules-human.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const id = '10000000-0000-4000-8000-000000000001'
const identity = {
  id,
  aal: 'aal2',
  userId: id,
  organizationId: id,
  fullName: 'Synthetic fixture',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: [...rolePermissions.SYSTEM_ADMINISTRATOR],
  assignedProjectIds: [id],
} as ApplicationIdentity
const leaf = {
  conditionId: 'c1',
  metric: 'ACTIVITY_OVERDUE_COUNT',
  operator: 'GTE',
  threshold: '1',
  thresholdMaximum: null,
  cell: { state: 'AVAILABLE', value: '2', reason: null },
  unit: 'COUNT',
  result: 'TRUE',
}
const dryRun = {
  ruleId: id,
  asOf: '2026-11-24T02:00:00.000Z',
  reportingDate: '2026-11-24',
  result: 'FALSE',
  conditions: [{ ...leaf, result: 'FALSE' }],
  severityBasis: null,
}
const rule = {
  id,
  projectId: id,
  logicalRuleId: id,
  templateOriginId: null,
  code: 'OVERDUE',
  version: 1,
  name: 'Overdue activity watch',
  severity: null,
  conditions: {
    kind: 'CONDITION',
    id: 'c1',
    metric: 'ACTIVITY_OVERDUE_COUNT',
    operator: 'GTE',
    threshold: '1',
  },
  recommendations: [{ id, title: 'Review', text: 'Review the schedule.' }],
  status: 'ACTIVE',
  activatedAt: '2026-11-24T02:00:00.000Z',
  archivedAt: null,
}

function setup(result: unknown | Error, drain?: () => Promise<unknown>) {
  const tx = {
    $queryRaw: vi.fn(async (_sql: Prisma.Sql) => {
      if (result instanceof Error) throw result
      return [{ result }]
    }),
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, who, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, who)) as typeof withAuthorizedOperation)
  return { tx, service: new RulesHumanService({} as PrismaService, drain ?? null) }
}

describe('current-data dry run', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls only the fixed SQL routine with the rule id and returns its checked result', async () => {
    const { tx, service } = setup(dryRun)
    await expect(service.dryRunCurrent(identity, id, {})).resolves.toEqual(dryRun)
    const sql = tx.$queryRaw.mock.calls[0][0]
    expect(sql.text).toBe('SELECT pathways.f10_rule_dry_run_current($1::uuid) AS result')
    expect(sql.values).toEqual([id])
    expect(withAuthorizedOperation).toHaveBeenCalledWith(
      expect.anything(),
      identity,
      'rules.read',
      expect.any(Function),
    )
  })

  it('refuses a body, a bad id, and a result outside the closed shape', async () => {
    const { tx, service } = setup(dryRun)
    expect(() => service.dryRunCurrent(identity, id, { projectId: id })).toThrow(
      'Invalid typed rules request.',
    )
    expect(() => service.dryRunCurrent(identity, 'not-a-uuid', {})).toThrow(
      'Invalid typed rules request.',
    )
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    for (const bad of [
      { ...dryRun, observations: [] },
      { ...dryRun, result: 'TRUE', severityBasis: null, conditions: [] },
      { ...dryRun, severityBasis: { status: 'CLASSIFIED' } },
    ]) {
      const next = setup(bad)
      await expect(next.service.dryRunCurrent(identity, id, {})).rejects.toMatchObject({
        status: 503,
      })
    }
  })

  it('maps a denied scope to 403 without detail', async () => {
    const { service } = setup(Object.assign(Error('db'), { meta: { code: '42501' } }))
    await expect(service.dryRunCurrent(identity, id, undefined)).rejects.toMatchObject({
      status: 403,
      message: 'Project rule configuration is unavailable under your current authority.',
    })
  })
})

describe('drain after activation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drains once after a committed activation and returns the rule', async () => {
    const drain = vi.fn().mockResolvedValue({ state: 'ACKNOWLEDGED' })
    const { service } = setup(rule, drain)
    await expect(service.activateRule(identity, id, {})).resolves.toEqual(rule)
    expect(drain).toHaveBeenCalledTimes(1)
  })

  it('keeps the activation response when the drain fails', async () => {
    const drain = vi.fn().mockRejectedValue(new Error('worker down'))
    const { service } = setup(rule, drain)
    await expect(service.activateRule(identity, id, {})).resolves.toEqual(rule)
    expect(drain).toHaveBeenCalledTimes(1)
  })

  it('never drains when the activation fails or the worker is disabled', async () => {
    const drain = vi.fn()
    const failing = setup(Object.assign(Error('db'), { meta: { code: '40001' } }), drain)
    await expect(failing.service.activateRule(identity, id, {})).rejects.toMatchObject({
      status: 409,
    })
    expect(drain).not.toHaveBeenCalled()
    const disabled = setup(rule)
    await expect(disabled.service.activateRule(identity, id, {})).resolves.toEqual(rule)
  })
})

describe('recommendation latest outcome', () => {
  const recommendation = {
    id,
    projectId: id,
    alertId: id,
    ruleId: id,
    title: 'Review',
    text: 'Review it.',
    basis: 'COMBINED',
    status: 'RESOLVED',
    revision: '2',
    proposedAt: '2026-11-20T00:00:00.000Z',
    reviewedAt: null,
    latestOutcome: {
      outcome: 'PARTIALLY_ACCEPT',
      note: 'Synthetic outcome note',
      actorName: 'Synthetic Officer',
      recordedAt: '2026-11-24T00:00:00.000Z',
    },
  }

  it('passes the SQL-checked outcome through and refuses loose note fields', async () => {
    await expect(setup(recommendation).service.getRecommendation(identity, id)).resolves.toEqual(
      recommendation,
    )
    await expect(
      setup({ ...recommendation, latestOutcome: null }).service.getRecommendation(identity, id),
    ).resolves.toMatchObject({ latestOutcome: null })
    await expect(
      setup({ ...recommendation, note: 'leak' }).service.getRecommendation(identity, id),
    ).rejects.toMatchObject({ status: 503 })
  })
})
