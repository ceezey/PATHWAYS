import { createHash } from 'node:crypto'
import { ForbiddenException, Logger } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { beforeEach, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import { ReportPdfError, type ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsService } from './reports.service'
const state = vi.hoisted(() => ({
  actor: undefined as unknown,
  tx: undefined as unknown,
  operations: 0,
  lostCommit: false,
  read: vi.fn(),
  artifact: vi.fn(),
}))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = state.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission as never))
      throw new ForbiddenException('Fresh grant required.')
    state.operations++
    const result = await work(state.tx, actor)
    if (state.lostCommit && state.operations === 2) throw Error('Commit response lost')
    return result
  },
}))
vi.mock('@pathways/config', async (original) => ({
  ...(await original<object>()),
  readApiEnv: () => ({
    BUSINESS_TIME_ZONE: 'Asia/Manila',
    SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-credential',
  }),
}))
vi.mock('./report-artifact', () => ({
  ReportArtifactInputError: class ReportArtifactInputError extends Error {},
  createReportArtifact: (...args: unknown[]) => state.artifact(...args),
  reportMime: {
    PDF: 'application/pdf',
    CSV: 'text/csv',
    XLS: 'application/vnd.ms-excel',
    XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
}))
export const projectId = 'abcdefab-0000-4000-8000-000000000001'
export const formId = '20000000-0000-4000-8000-000000000002'
export const id = 'abcdefab-0000-4000-8000-000000000003'
const org = '40000000-0000-4000-8000-000000000004'
export const actor: ApplicationIdentity = {
  id,
  aal: 'aal2',
  userId: id,
  organizationId: org,
  fullName: 'Fictional report author',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'reports.read',
    'reports.project.read',
    'reports.generate',
    'reports.export',
    'assessments.read',
    'forms.read',
  ],
  assignedProjectIds: [projectId],
}
export const project = {
  id: projectId,
  code: 'SYN',
  title: 'Recorded project',
  status: 'ACTIVE',
  implementationArea: null,
  sector: null,
  startDate: null,
  endDate: null,
  implementingPartnerLinks: [],
  programManager: null,
}
export const tx = {
  project: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  auditLog: { create: vi.fn() },
  report: { findMany: vi.fn() },
  projectEvaluation: { findFirst: vi.fn(), findMany: vi.fn() },
  projectEvaluationScore: { findMany: vi.fn() },
}
export const storage = { uploadPrivateFile: vi.fn(), deleteFile: vi.fn() }
export const dashboards = { monitoringInTransaction: vi.fn() }
export const renderer = { render: vi.fn() }
export const overview = { readInTransaction: vi.fn() }
const rules = { listAlertsInTransaction: vi.fn() }
const storageFactories = {
  createPrivateInspectionReader: () => state.read,
} as unknown as PrivateStorageFactories
export const service = new ReportsService(
  {} as PrismaService,
  storage as unknown as StorageService,
  dashboards as unknown as DashboardsService,
  renderer as unknown as ReportPdfRenderer,
  overview as unknown as ProjectOverviewMetricsService,
  rules as unknown as RulesHumanService,
  storageFactories,
)
export const body = {
  clientRequestId: id,
  name: 'Private report',
  kind: 'PROJECT_SUMMARY',
  format: 'PDF',
}
export const field = {
  code: 'learning',
  label: 'Learning outcome',
  type: 'DECIMAL',
  answered: 5,
  missing: 0,
  trueCount: null,
  falseCount: null,
  mean: '99999999999999.1234',
  meanState: 'AVAILABLE',
}
export const survey = (overrides: object = {}) => ({
  state: 'AVAILABLE',
  respondents: 5,
  formId,
  formVersion: 1,
  fields: [field],
  ...overrides,
})
export const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
export { state }

export function useReportsHarness() {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx
    state.operations = 0
    state.lostCommit = false
    state.read.mockResolvedValue(Buffer.from('%PDF-fixture'))
    state.artifact.mockResolvedValue(Buffer.from('%PDF-fixture'))
    renderer.render.mockRejectedValue(new ReportPdfError('launch', 'Error'))
    tx.project.findFirst.mockResolvedValue(project)
    overview.readInTransaction.mockResolvedValue({
      businessDate: '2026-10-06',
      timeline: { metric: { state: 'MISSING', value: null, reason: 'PROJECT_DATES_REQUIRED' } },
      budgetUtilization: null,
      kpiAchievement: null,
      beneficiariesReached: null,
    })
    tx.projectEvaluation.findFirst.mockResolvedValue(null)
    tx.projectEvaluationScore.findMany.mockResolvedValue([])
    tx.$queryRaw.mockResolvedValue([])
    tx.$executeRaw.mockResolvedValue(1)
    storage.uploadPrivateFile.mockResolvedValue(undefined)
    storage.deleteFile.mockResolvedValue(undefined)
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })
}
