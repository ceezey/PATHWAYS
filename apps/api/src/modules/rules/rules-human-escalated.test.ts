import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escalatedAlertOutputSchema } from './rules-human-contract'
import { AlertsController } from './rules-human.controller'
import { RulesHumanService } from './rules-human.service'

vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const id = '10000000-0000-4000-8000-000000000001'
const alert = {
  id,
  projectId: id,
  ruleId: id,
  ruleVersion: 1,
  title: 'Schedule risk',
  explanation: 'Remaining days fell below zero.',
  severity: 'HIGH',
  lifecycle: 'REVIEWED',
  revision: '3',
  evaluatedAt: '2026-09-27T01:00:00Z',
  freshness: 'CURRENT',
  conditions: {
    kind: 'CONDITION',
    id: 'days',
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '0',
  },
  evidence: [
    {
      conditionId: 'days',
      metric: 'PROJECT_REMAINING_DAYS',
      operator: 'LT',
      threshold: '0',
      thresholdMaximum: null,
      cell: { state: 'AVAILABLE', value: '-1', reason: null },
      unit: 'days',
      result: 'TRUE',
    },
  ],
  asOf: '2026-09-27T01:00:00Z',
  reportingDate: '2026-09-27',
  calendar: { zone: 'Asia/Manila', version: '1' },
  predefinedRecommendations: [{ id, title: 'Review schedule', text: 'Review schedule.' }],
  linkedRecommendationIds: [],
}

function setup(result: unknown) {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([{ result }]) }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const identity = {
    id,
    aal: 'aal2',
    userId: id,
    organizationId: id,
    fullName: 'Synthetic fixture',
    roles: ['PROGRAM_MANAGER'],
    permissions: [...rolePermissions.PROGRAM_MANAGER],
    assignedProjectIds: [id],
  } as ApplicationIdentity
  return { tx, identity, service: new RulesHumanService({} as PrismaService) }
}

describe('escalated alerts read', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls the fixed escalated list routine with the default limit', async () => {
    const escalated = { ...alert, escalatedAt: '2026-09-28T02:00:00Z' }
    const { tx, identity, service } = setup({ items: [escalated], nextCursor: null })
    const page = await service.listEscalatedAlerts(identity, {})
    expect(page.items[0]?.escalatedAt).toBe('2026-09-28T02:00:00Z')
    expect(vi.mocked(withAuthorizedOperation).mock.calls[0][2]).toBe('alerts.read')
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql
    expect(sql.sql).toMatch(/^SELECT pathways\.f10_escalated_alert_list\(.+::jsonb\) AS result$/)
    expect(JSON.parse(String(sql.values[0]))).toEqual({ limit: 25 })
  })

  it('rejects unknown query keys before reaching the database', () => {
    const { tx, identity, service } = setup({ items: [], nextCursor: null })
    expect(() => service.listEscalatedAlerts(identity, { status: 'NEW' })).toThrow(
      'Invalid typed rules request.',
    )
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('refuses an output item without escalatedAt', async () => {
    expect(escalatedAlertOutputSchema.safeParse(alert).success).toBe(false)
    const { identity, service } = setup({ items: [alert], nextCursor: null })
    await expect(service.listEscalatedAlerts(identity, {})).rejects.toMatchObject({ status: 503 })
  })

  it('declares the escalated route before :id with alerts.read', () => {
    const names = Object.getOwnPropertyNames(AlertsController.prototype)
    expect(names.indexOf('escalated')).toBeGreaterThan(-1)
    expect(names.indexOf('escalated')).toBeLessThan(names.indexOf('get'))
    expect(Reflect.getMetadata(PERMISSION_KEY, AlertsController.prototype.escalated)).toBe(
      'alerts.read',
    )
  })
})
