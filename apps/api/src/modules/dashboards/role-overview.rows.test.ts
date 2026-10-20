import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { RulesHumanService } from '@app/modules/rules/rules-human.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleOverviewService } from './role-overview.service'

vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

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
    activityExtensionRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    activityEscalation: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const rules = {
    listAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listEscalatedAlerts: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  }
  const service = new RoleOverviewService(
    {} as PrismaService,
    rules as unknown as RulesHumanService,
  )
  return { tx, rules, service }
}

const byTitle = [{ title: 'asc' }, { id: 'asc' }]
const byId = { id: 'asc' }
const caps = {
  PROJECT_OFFICER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityUpdate', 50, [{ reviewedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'desc' }, byId]],
  ],
  MONITORING_AND_EVALUATION_OFFICER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'asc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'asc' }, byId]],
  ],
  PROJECT_MANAGER: [
    ['project', 20, byTitle],
    ['projectActivity', 5, [{ plannedEndDate: 'asc' }, byId]],
    ['activityUpdate', 5, [{ submittedAt: 'desc' }, byId]],
    ['activityUpdate', 50, [{ reviewedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ submittedAt: 'desc' }, byId]],
    ['budgetExpenseEntry', 5, [{ verifiedAt: 'asc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'desc' }, byId]],
    ['activityExtensionRequest', 5, [{ requestedAt: 'asc' }, byId]],
    ['activityEscalation', 5, [{ raisedAt: 'asc' }, byId]],
  ],
} as const

describe('RoleOverviewService row caps', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(Object.keys(caps) as Array<keyof typeof caps>)(
    'sends the same model, take and orderBy to every reader for %s',
    async (role) => {
      const { tx, service } = setup()
      await service.read(actor(role))
      const sent = Object.entries(tx).flatMap(([model, delegate]) =>
        ('findMany' in delegate ? delegate.findMany.mock.calls : []).map(([arg]) => [
          model,
          arg.take,
          arg.orderBy,
        ]),
      )
      expect(sent).toEqual(caps[role])
    },
  )
})
