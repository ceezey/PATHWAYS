import 'reflect-metadata'

import { rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { roleOverviewSchema } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleOverviewService } from './role-overview.service'

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
    project: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: project,
          code: 'P-1',
          title: 'Project',
          status: 'ONGOING',
          program: { name: 'Prog' },
          userProjectAssignment_project: [{ user: { fullName: 'Pat Manager' } }],
        },
      ]),
    },
    projectActivity: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    activityUpdate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    budgetExpenseEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    dataImportBatch: { count: vi.fn().mockResolvedValue(2) },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const rules = { listAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) }
  const service = new RoleOverviewService(
    {} as PrismaService,
    rules as unknown as RulesHumanService,
  )
  return { tx, rules, service }
}

describe('RoleOverviewService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes every query to the organization and the actor project scope', async () => {
    const { tx, service } = setup()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    for (const fn of [
      tx.activityUpdate.findMany,
      tx.activityUpdate.count,
      tx.dataImportBatch.count,
    ]) {
      expect(fn.mock.calls.length).toBeGreaterThan(0)
      for (const [arg] of fn.mock.calls) {
        expect(arg.where.organizationId).toBe(org)
        expect(arg.where.project).toMatchObject({ organizationId: org, id: { in: [project] } })
      }
    }
  })

  it('returns null sections for permissions the viewer lacks', async () => {
    const { service } = setup()
    const result = await service.read(actor('GRANT_MANAGER'))
    expect(result.proofQueue).toBeNull()
    expect(result.approvalQueue).toBeNull()
    expect(result.flaggedProof).toBeNull()
    expect(roleOverviewSchema.parse(result)).toEqual(result)
  })

  it('limits officer activities to active assignments of the viewer', async () => {
    const { tx, service } = setup()
    await service.read(actor('PROJECT_OFFICER'))
    const where = tx.projectActivity.findMany.mock.calls[0][0].where
    expect(where.projectActivityAssignment_activity).toEqual({
      some: { status: 'ACTIVE', projectAssignment: { userId: user, status: 'ACTIVE' } },
    })
  })

  it('does not mark an activity without a planned end date as overdue', async () => {
    const { tx, service } = setup()
    tx.projectActivity.findMany.mockResolvedValue([
      {
        id: project,
        projectId: project,
        code: 'A',
        title: 'T',
        status: 'IN_PROGRESS',
        plannedEndDate: null,
        progressPercent: 10,
        project: { title: 'P' },
      },
    ])
    tx.projectActivity.count.mockResolvedValue(1)
    const result = await service.read(actor('PROJECT_OFFICER'))
    expect(result.myActivities?.rows[0].overdue).toBe(false)
  })

  it('excludes own submissions from the review queues', async () => {
    const { tx, service } = setup()
    await service.read(actor('MONITORING_AND_EVALUATION_OFFICER'))
    const queue = tx.activityUpdate.findMany.mock.calls.find(
      ([arg]) => arg.where.status === 'PENDING',
    )
    expect(queue?.[0].where.submittedById).toEqual({ not: user })
  })
})
