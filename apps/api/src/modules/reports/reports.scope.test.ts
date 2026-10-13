import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import type { PrismaService } from '../../prisma/prisma.service'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import type { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsService } from './reports.service'

const state = vi.hoisted(() => ({ tx: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    identity: unknown,
    _permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => work(state.tx, identity),
}))

const projectId = 'abcdefab-0000-4000-8000-000000000001'
const upper = projectId.toUpperCase()
const actor: ApplicationIdentity = {
  id: projectId,
  aal: 'aal2',
  userId: projectId,
  organizationId: '40000000-0000-4000-8000-000000000004',
  fullName: 'Fictional report reader',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'reports.read',
    'reports.project.read',
    'assessments.read',
    'forms.read',
    'monitoring.read',
  ],
  assignedProjectIds: [projectId],
}
const tx = {
  project: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  report: { findMany: vi.fn() },
  projectEvaluation: { findMany: vi.fn() },
}
const service = new ReportsService(
  {} as PrismaService,
  {} as StorageService,
  {} as DashboardsService,
  {} as ReportPdfRenderer,
  {} as ProjectOverviewMetricsService,
  {} as RulesHumanService,
  {} as PrivateStorageFactories,
)
const reads = {
  surveyForms: (id: string, who = actor) => service.surveyForms(who, id),
  evaluationRounds: (id: string, who = actor) => service.evaluationRounds(who, id),
  list: (id: string, who = actor) => service.list(who, id),
}

describe('report read routes project scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([])
    tx.report.findMany.mockResolvedValue([])
    tx.projectEvaluation.findMany.mockResolvedValue([])
  })

  it.each(Object.entries(reads))(
    '%s answers 404 for a malformed id without a lookup',
    async (_name, read) => {
      await expect(read('not-a-uuid')).rejects.toThrow(
        new NotFoundException('Project unavailable.'),
      )
      expect(tx.project.findFirst).not.toHaveBeenCalled()
    },
  )

  it.each(Object.entries(reads))(
    '%s answers 404 for a project outside scope',
    async (_name, read) => {
      tx.project.findFirst.mockResolvedValue(null)
      await expect(read(projectId)).rejects.toThrow(new NotFoundException('Project unavailable.'))
    },
  )

  it('reads with the project id as the caller sent it', async () => {
    await reads.surveyForms(upper)
    await reads.evaluationRounds(upper)
    await reads.list(upper)
    expect(tx.$queryRaw.mock.calls[0]).toContain(upper)
    expect(tx.projectEvaluation.findMany.mock.calls[0]?.[0].where.projectId).toBe(upper)
    expect(tx.report.findMany.mock.calls[0]?.[0].where.projectId).toBe(upper)
  })

  it.each(Object.entries(reads))(
    '%s looks the project up by organization scope and lowercase id',
    async (_name, read) => {
      await read(upper)
      expect(tx.project.findFirst).toHaveBeenCalledWith({
        where: { AND: [projectScope(actor), { id: projectId }] },
        select: { id: true },
      })
    },
  )

  it.each([['surveyForms'], ['evaluationRounds']] as const)(
    '%s answers 403 for a caller without the grants before any lookup',
    async (name) => {
      await expect(reads[name](projectId, { ...actor, permissions: [] })).rejects.toThrow(
        ForbiddenException,
      )
      expect(tx.project.findFirst).not.toHaveBeenCalled()
    },
  )
})
