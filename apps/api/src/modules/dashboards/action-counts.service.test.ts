import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { dashboardActionCountsSchema } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionCountsController } from './action-counts.controller'
import { ActionCountsService } from './action-counts.service'

vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const user = '30000000-0000-4000-8000-000000000001'

function actor(role: keyof typeof rolePermissions) {
  return {
    id: user,
    aal: 'aal2',
    userId: user,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [project],
  } as ApplicationIdentity
}

function setup() {
  const tx = {
    budgetExpenseEntry: { count: vi.fn().mockResolvedValue(3) },
    projectActivity: {
      count: vi.fn().mockResolvedValue(2),
      findFirst: vi.fn().mockResolvedValue({
        code: 'ACT-1',
        plannedEndDate: new Date('2000-01-01T00:00:00.000Z'),
      }),
    },
    activityUpdate: { count: vi.fn().mockResolvedValue(5) },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx, identity)) as typeof withAuthorizedOperation)
  const rules = { listAlerts: vi.fn().mockResolvedValue({ items: [{}, {}], nextCursor: null }) }
  const service = new ActionCountsService(
    {} as PrismaService,
    rules as unknown as RulesHumanService,
  )
  return { tx, rules, service }
}

describe('ActionCountsService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes every count to the organization and the actor project scope', async () => {
    const { tx, service } = setup()
    const result = await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    expect(dashboardActionCountsSchema.parse(result)).toEqual(result)
    for (const call of [
      tx.budgetExpenseEntry.count,
      tx.projectActivity.count,
      tx.activityUpdate.count,
    ]) {
      const where = call.mock.calls[0][0].where
      expect(where.organizationId).toBe(org)
      expect(where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
    }
    expect(tx.budgetExpenseEntry.count.mock.calls[0][0].where.status).toEqual({ in: ['PENDING'] })
    expect(tx.budgetExpenseEntry.count.mock.calls[0][0].where.submittedById).toEqual({
      not: expect.any(String),
    })
    expect(result.overdueActivities?.mostOverdue?.code).toBe('ACT-1')
    expect(result.overdueActivities?.mostOverdue?.daysLate).toBeGreaterThan(1)
  })

  it('returns null and runs no query without the grant', async () => {
    const { tx, rules, service } = setup()
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.pendingApprovals).toBeNull()
    expect(result.forReview).toBeNull()
    expect(tx.budgetExpenseEntry.count).not.toHaveBeenCalled()
    expect(tx.activityUpdate.count).not.toHaveBeenCalled()
    const noAlerts = actor('PROJECT_OFFICER')
    noAlerts.permissions = noAlerts.permissions.filter((p) => p !== 'alerts.read')
    expect((await service.read(noAlerts)).activeAlerts).toBeNull()
    expect(rules.listAlerts).not.toHaveBeenCalledWith(noAlerts, expect.anything())
  })

  it('counts verified expenses for the approver role', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_MANAGER'))
    expect(tx.budgetExpenseEntry.count.mock.calls[0][0].where.status).toEqual({ in: ['VERIFIED'] })
  })

  it('sums NEW and REVIEWED alerts through the scoped rules routine and follows cursors', async () => {
    const { rules, service } = setup()
    rules.listAlerts
      .mockResolvedValueOnce({ items: [{}], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [{}, {}], nextCursor: null })
      .mockResolvedValueOnce({ items: [{}], nextCursor: null })
    const result = await service.read(actor('PROJECT_MANAGER'))
    expect(result.activeAlerts).toEqual({ count: 4, capped: false })
    expect(rules.listAlerts.mock.calls.map((call) => call[1].status)).toEqual([
      'NEW',
      'NEW',
      'REVIEWED',
    ])
  })

  it('guards the route with projects.read', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ActionCountsController.prototype.read)).toBe(
      'projects.read',
    )
  })
})
