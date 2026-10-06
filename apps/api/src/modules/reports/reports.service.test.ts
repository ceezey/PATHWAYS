import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { ReportPdfError, type ReportPdfRenderer } from '../report-pdf/report-pdf.renderer'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { StorageService } from '../storage/storage.service'
import { sourceFingerprint } from './report-fingerprint'
import { reportInputSchema, reportQuerySchema } from './reports.dto'
import { ReportsService } from './reports.service'
const state = vi.hoisted(() => ({
  actor: undefined as unknown,
  tx: undefined as unknown,
  operations: 0,
  lostCommit: false,
  read: vi.fn(),
  artifact: vi.fn(),
}))
vi.mock('../auth/authorized-operation', () => ({
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
vi.mock('../storage/private-inspection-reader', () => ({
  createPrivateInspectionReader: () => state.read,
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
const projectId = 'abcdefab-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const id = 'abcdefab-0000-4000-8000-000000000003'
const org = '40000000-0000-4000-8000-000000000004'
const actor: ApplicationIdentity = {
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
const project = {
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
const tx = {
  project: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  auditLog: { create: vi.fn() },
  report: { findMany: vi.fn() },
  projectEvaluation: { findFirst: vi.fn() },
  projectEvaluationScore: { findMany: vi.fn() },
}
const storage = { uploadPrivateFile: vi.fn(), deleteFile: vi.fn() }
const dashboards = { monitoringInTransaction: vi.fn() }
const renderer = { render: vi.fn() }
const overview = { readInTransaction: vi.fn() }
const rules = { listAlertsInTransaction: vi.fn() }
const service = new ReportsService(
  {} as PrismaService,
  storage as unknown as StorageService,
  dashboards as unknown as DashboardsService,
  renderer as unknown as ReportPdfRenderer,
  overview as unknown as ProjectOverviewMetricsService,
  rules as unknown as RulesHumanService,
)
const body = { clientRequestId: id, name: 'Private report', kind: 'PROJECT_SUMMARY', format: 'PDF' }
const field = {
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
const survey = (overrides: object = {}) => ({
  state: 'AVAILABLE',
  respondents: 5,
  formId,
  formVersion: 1,
  fields: [field],
  ...overrides,
})
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
describe('report source authority, privacy and artifact recovery', () => {
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
  it('requires exact survey-only form context and rejects caller filter dimensions', () => {
    expect(reportQuerySchema.safeParse({ kind: 'SURVEY_FORM_RESULTS' }).success).toBe(false)
    expect(reportQuerySchema.safeParse({ kind: 'PROJECT_SUMMARY', formId }).success).toBe(false)
    expect(
      reportQuerySchema.safeParse({
        kind: 'SURVEY_FORM_RESULTS',
        formId,
        periodStart: '2026-01-01',
      }).success,
    ).toBe(false)
    expect(
      reportInputSchema.safeParse({ ...body, kind: 'SURVEY_FORM_RESULTS', formId }).success,
    ).toBe(true)
  })
  it('does not trust a caller grant revoked in the current profile', async () => {
    state.actor = { ...actor, permissions: [] }
    await expect(service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })).rejects.toThrow(
      ForbiddenException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })
  it('omits beneficiary report metadata when either aggregate grant is revoked', async () => {
    for (const missing of ['analytics.saddd.read', 'beneficiaries.aggregates.read']) {
      state.actor = {
        ...actor,
        permissions: [
          ...actor.permissions,
          'reports.beneficiary.read',
          'analytics.saddd.read',
          'beneficiaries.aggregates.read',
        ].filter((permission) => permission !== missing),
      }
      tx.report.findMany.mockResolvedValue([])
      await service.list(actor, projectId)
      const query = tx.report.findMany.mock.lastCall?.[0]
      expect(query?.where.type.in).not.toContain('BENEFICIARY_SUMMARY')
    }
  })
  it.each(['99999999999999.1234', '-99999999999999.1234'])(
    'preserves exact decimal mean text %s and fingerprint bytes',
    async (mean) => {
      tx.$queryRaw.mockResolvedValue([{ value: survey({ fields: [{ ...field, mean }] }) }])
      const preview = await service.preview(actor, projectId, {
        kind: 'SURVEY_FORM_RESULTS',
        formId,
      })
      expect(preview.rows[0][7]).toBe(mean)
      expect(sha({ rows: preview.rows })).not.toBe(
        sha({
          rows: preview.rows.map((row) =>
            row.map((cell) => (cell === mean ? String(Number(mean)) : cell)),
          ),
        }),
      )
      const query = tx.$queryRaw.mock.calls[0][0]
      expect(query.join('')).toContain("field->>'mean'")
    },
  )
  it('keeps every count and mean unavailable in a suppressed release', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        value: survey({
          state: 'SUPPRESSED',
          respondents: null,
          fields: [
            { ...field, answered: null, missing: null, mean: null, meanState: 'SUPPRESSED' },
          ],
        }),
      },
    ])
    const preview = await service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId })
    expect(preview.rows[0].slice(2, 8)).toEqual(Array(6).fill('Not available'))
    expect(preview.rows[0][8]).toBe('SUPPRESSED')
  })
  it('lists a legacy indicator without measurement mode or direction in the indicator summary', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        value: [
          {
            id: '79000000-0000-4000-8000-000000000031',
            name: 'Legacy indicator',
            code: 'LEGACY-01',
            unitLabel: null,
            baseline: null,
            target: null,
            direction: null,
            periodStart: null,
            periodEnd: null,
            current: { state: 'MISSING', value: null, reason: 'LEGACY_REVIEW_REQUIRED' },
          },
        ],
      },
    ])
    const reader = { ...actor, permissions: [...actor.permissions, 'reports.indicator.read'] }
    state.actor = reader
    const preview = await service.preview(reader, projectId, { kind: 'INDICATOR_SUMMARY' })
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0].slice(0, 2)).toEqual(['LEGACY-01', 'Legacy indicator'])
  })
  it('rejects a malformed suppressed release rather than leaking a count', async () => {
    tx.$queryRaw.mockResolvedValue([{ value: survey({ state: 'SUPPRESSED', respondents: null }) }])
    await expect(
      service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId }),
    ).rejects.toThrow('Invalid survey release shape')
  })
  it.each(['STALE', 'MISSING'])(
    'previews %s truthfully and rejects its generation before reservation',
    async (stateName) => {
      tx.$queryRaw.mockResolvedValue([
        { value: { state: stateName, respondents: null, fields: [] } },
      ])
      expect(
        (await service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId })).rows,
      ).toEqual([])
      state.operations = 0
      await expect(
        service.generate(actor, projectId, { ...body, kind: 'SURVEY_FORM_RESULTS', formId }),
      ).rejects.toThrow('Survey aggregate unavailable')
      expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    },
  )
  it('recovers the same generated report across UUID case aliases without another upload', async () => {
    let persisted: Record<string, unknown> | undefined
    tx.$executeRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join('').includes('INSERT INTO pathways.reports')) {
        persisted = {
          id: values[0],
          projectId: values[2],
          hash: values[8],
          sourceFingerprint: values[9],
          status: 'DRAFT',
        }
      } else if (sql.join('').includes('UPDATE pathways.reports')) {
        if (!persisted) throw Error('Reservation missing')
        persisted.status = 'GENERATED'
      }
      return 1
    })
    tx.$queryRaw.mockImplementation(
      async (sql: { strings?: string[]; join?: (separator: string) => string }) => {
        const text = sql.strings?.join('') ?? sql.join?.('') ?? ''
        return text.includes('FROM pathways.reports') && persisted ? [persisted] : []
      },
    )
    const first = await service.generate(actor, projectId.toUpperCase(), {
      ...body,
      clientRequestId: id.toUpperCase(),
    })
    const lock = tx.$queryRaw.mock.calls.find((call) =>
      call[0].join('').includes('pg_advisory_xact_lock'),
    )
    expect(lock?.[0].join('')).toMatch(
      /^SELECT 1::integer AS locked FROM pg_catalog\.pg_advisory_xact_lock/,
    )
    const retry = await service.generate(actor, projectId, body)
    // pdfFallback describes the render that just ran, so a recovered report omits it.
    expect(retry).toEqual({ id: first.id, status: first.status })
    expect(storage.uploadPrivateFile).toHaveBeenCalledOnce()
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    await expect(
      service.generate(actor, projectId, { ...body, name: 'Changed content' }),
    ).rejects.toThrow('Request key used for different report content')
  })
  it('preserves an uploaded artifact when finalize committed but its response was lost', async () => {
    state.lostCommit = true
    await expect(service.generate(actor, projectId, body)).rejects.toThrow('Commit response lost')
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    expect(storage.uploadPrivateFile).toHaveBeenCalledOnce()
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })
  it('deletes only its allocated upload when verification definitely fails before finalization', async () => {
    state.read.mockRejectedValue(Error('Hash mismatch'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report storage unavailable')
    expect(storage.deleteFile).toHaveBeenCalledOnce()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('reports a storage upload outage as unavailable without cleanup or audit', async () => {
    storage.uploadPrivateFile.mockRejectedValue(Error('provider detail'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report storage unavailable')
    expect(storage.deleteFile).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('returns a correctable artifact input problem as 422 before any upload', async () => {
    const { ReportArtifactInputError } = await import('./report-artifact')
    state.artifact.mockRejectedValue(
      new ReportArtifactInputError('PDF contains a character unsupported by the bundled font.'),
    )
    const failure = service.generate(actor, projectId, { ...body, name: 'Report 🌍' })
    await expect(failure).rejects.toBeInstanceOf(UnprocessableEntityException)
    await expect(failure).rejects.toThrow('unsupported by the bundled font')
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
  it('maps a renderer or integrity fault to unavailable before any upload', async () => {
    state.artifact.mockRejectedValue(Error('Report font integrity unavailable.'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Report generation temporarily unavailable')
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
  it('stores the designed PDF from the renderer without calling pdfkit', async () => {
    renderer.render.mockResolvedValue(Buffer.from('%PDF-designed'))
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    expect(acknowledgement).not.toHaveProperty('pdfFallback')
    expect(renderer.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Private report', kind: 'PROJECT_SUMMARY' }),
    )
    expect(state.artifact).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-designed'),
      'application/pdf',
    )
  })
  it('falls back to the pdfkit artifact when the renderer fails', async () => {
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    // The caller is told the stored PDF is the plain layout, so it can say it will not match.
    expect(acknowledgement).toMatchObject({ pdfFallback: true })
    expect(renderer.render).toHaveBeenCalledOnce()
    expect(state.artifact).toHaveBeenCalledOnce()
    const warning = vi.mocked(Logger.prototype.warn).mock.calls.flat().join(' ')
    expect(vi.mocked(Logger.prototype.warn)).toHaveBeenCalledOnce()
    expect(warning).toContain('at launch')
    expect(warning).toContain('using pdfkit')
    expect(warning).not.toContain('Private report')
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-fixture'),
      'application/pdf',
    )
  })
  it('never launches the renderer for spreadsheet formats', async () => {
    for (const format of ['CSV', 'XLS', 'XLSX'])
      await service
        .generate(actor, projectId, { ...body, format, clientRequestId: crypto.randomUUID() })
        .catch(() => undefined)
    expect(renderer.render).not.toHaveBeenCalled()
  })
  it('reports a private artifact read outage on export as unavailable without audit', async () => {
    let fingerprint: unknown
    tx.$executeRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join('').includes('INSERT INTO pathways.reports')) fingerprint = values[9]
      return 1
    })
    await service.generate(actor, projectId, body)
    tx.auditLog.create.mockClear()
    tx.$queryRaw.mockImplementation(
      async (sql: { strings?: string[]; join?: (separator: string) => string }) => {
        const text = sql.strings?.join('') ?? sql.join?.('') ?? ''
        return text.includes('FROM pathways.reports')
          ? [
              {
                id,
                projectId,
                formId: null,
                type: 'PROJECT_SUMMARY',
                format: 'PDF',
                status: 'GENERATED',
                sourceFingerprint: fingerprint,
                bucket: 'pathways-private',
                key: 'organizations/synthetic/report.pdf',
                sha: 'b'.repeat(64),
                bytes: 12,
              },
            ]
          : []
      },
    )
    state.read.mockRejectedValue(Error('network detail'))
    const failure = service.export(actor, projectId, id)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report artifact unavailable')
    expect(state.read).toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  describe('monitoring and evaluation report kinds', () => {
    const grant = (...extra: string[]) => {
      state.actor = { ...actor, permissions: [...actor.permissions, ...extra] }
    }
    const metric = { state: 'AVAILABLE', value: '7', reason: null }
    const hidden = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    const monitoring = {
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      activities: [{ key: 'DONE', label: 'Completed', metric }],
      milestones: [{ key: 'PENDING', label: 'Pending', metric: hidden }],
      participationRecords: hidden,
      indicators: [
        { code: 'I1', name: 'Reach', current: metric, progress: { ...metric, value: '50' } },
      ],
    }
    const signedOff = {
      id: '60000000-0000-4000-8000-000000000006',
      title: 'Midterm',
      status: 'SIGNED_OFF',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-06-30'),
      overallScore: { toString: () => '82.5' },
    }

    const previewKeys = [
      'columns',
      'formId',
      'generatedAt',
      'kind',
      'projectId',
      'rows',
      'unavailableReasons',
    ]

    it('requires monitoring.read on top of the kind grant', async () => {
      grant('reports.indicator.read')
      await expect(
        service.preview(actor, projectId, { kind: 'MONITORING_REPORT' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('builds monitoring rows from the trusted aggregate and keeps suppression', async () => {
      grant('reports.indicator.read', 'monitoring.read')
      tx.project.findFirst.mockResolvedValue({
        ...project,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
      })
      dashboards.monitoringInTransaction.mockResolvedValue(monitoring)
      const preview = await service.preview(actor, projectId, { kind: 'MONITORING_REPORT' })
      expect(dashboards.monitoringInTransaction.mock.calls[0][3]).toMatchObject({
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
      })
      expect(preview.rows).toContainEqual([
        'Participation',
        'Participation records',
        'Not available',
        'SUPPRESSED',
        'SMALL_CELL',
      ])
      expect(preview.rows).toContainEqual(['Indicator progress', 'I1 Reach', '50', 'AVAILABLE', ''])
    })

    it('reports missing project dates instead of guessing a monitoring period', async () => {
      grant('reports.indicator.read', 'monitoring.read')
      const preview = await service.preview(actor, projectId, { kind: 'MONITORING_REPORT' })
      expect(preview.rows).toEqual([])
      expect(preview.unavailableReasons).toHaveLength(1)
      expect(dashboards.monitoringInTransaction).not.toHaveBeenCalled()
    })

    it('previews no data and refuses generation when no evaluation is signed off', async () => {
      grant('monitoring.read')
      const preview = await service.preview(actor, projectId, { kind: 'EVALUATION_REPORT' })
      expect(preview.rows).toEqual([])
      expect(preview.unavailableReasons).toHaveLength(1)
      expect(Object.keys(preview).sort()).toEqual(previewKeys)
      state.operations = 0
      await expect(
        service.generate(actor, projectId, { ...body, kind: 'EVALUATION_REPORT' }),
      ).rejects.toThrow(ConflictException)
      expect(tx.$executeRaw).not.toHaveBeenCalled()
      expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    })

    it('lists the latest signed-off evaluation scores and stores its id on the report', async () => {
      grant('monitoring.read')
      tx.projectEvaluation.findFirst.mockResolvedValue(signedOff)
      tx.projectEvaluationScore.findMany.mockResolvedValue([
        {
          score: { toString: () => '8' },
          maximumScore: { toString: () => '10' },
          weightedScore: { toString: () => '40' },
          criterionSnapshot: { code: 'C1', name: 'Relevance', weight_percentage: '50' },
        },
      ])
      const preview = await service.preview(actor, projectId, { kind: 'EVALUATION_REPORT' })
      expect(preview.rows[1]).toEqual(['Criterion', 'C1 Relevance', '50', '8', '10', '40'])
      expect(Object.keys(preview).sort()).toEqual(previewKeys)
      const where = tx.projectEvaluation.findFirst.mock.calls[0][0].where
      expect(where.status).toEqual({ in: ['SIGNED_OFF', 'ARCHIVED'] })
      await service.generate(actor, projectId, { ...body, kind: 'EVALUATION_REPORT' })
      const insert = tx.$executeRaw.mock.calls.find((call) =>
        call[0].join('').includes('INSERT INTO pathways.reports'),
      )
      expect(insert?.[11]).toBe(signedOff.id)
    })

    it('lists the new kinds only for holders of the extra grant', async () => {
      grant('reports.indicator.read')
      tx.report.findMany.mockResolvedValue([])
      await service.list(actor, projectId)
      expect(tx.report.findMany.mock.lastCall?.[0].where.type.in).not.toContain('MONITORING_REPORT')
      grant('reports.indicator.read', 'monitoring.read')
      await service.list(actor, projectId)
      expect(tx.report.findMany.mock.lastCall?.[0].where.type.in).toContain('MONITORING_REPORT')
    })
  })
  it('rejects an invalid project UUID before querying artifact casts', async () => {
    await expect(service.export(actor, 'invalid', id)).rejects.toThrow('Report unavailable')
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('never transfers stale source bytes to the private reader', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id,
        projectId,
        formId: null,
        type: 'PROJECT_SUMMARY',
        sourceFingerprint: 'a'.repeat(64),
        status: 'GENERATED',
      },
    ])
    await expect(service.export(actor, projectId, id)).rejects.toThrow('Report source is stale')
    expect(state.read).not.toHaveBeenCalled()
  })
  it('returns sections with a flattened copy and sends them to the designed renderer', async () => {
    const preview = await service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })
    expect(preview.sections?.information.code).toBe('SYN')
    expect(preview.columns).toEqual(['Section', 'Item', 'Value', 'Detail'])
    expect(preview.rows.some((row) => row[0] === 'Overview')).toBe(true)
    expect(preview.unavailableReasons.length).toBeGreaterThan(0)
    renderer.render.mockResolvedValue(Buffer.from('%PDF-designed'))
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    expect(acknowledgement).not.toHaveProperty('pdfFallback')
    expect(renderer.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sections: expect.objectContaining({ overview: expect.any(Array) }),
      }),
    )
  })
  describe('project summary section integrity', () => {
    const budgetOverview = (state: string) => ({
      businessDate: '2026-10-06',
      timeline: { metric: { state: 'AVAILABLE', value: '50', reason: null } },
      budgetUtilization: {
        metric: { state, value: state === 'AVAILABLE' ? '40' : null, reason: null },
        approvedBudget: '100.00',
        countableSpending: '40.00',
      },
      kpiAchievement: null,
      beneficiariesReached: null,
    })
    it('rejects generation when a section-only field changes between prepare and finalize', async () => {
      overview.readInTransaction
        .mockResolvedValueOnce(budgetOverview('AVAILABLE'))
        .mockResolvedValue(budgetOverview('SUPPRESSED'))
      await expect(service.generate(actor, projectId, body)).rejects.toThrow(
        'Report source changed',
      )
    })
    it('rejects export when the stored fingerprint was taken from different sections', async () => {
      overview.readInTransaction.mockResolvedValue(budgetOverview('AVAILABLE'))
      const first = await service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })
      const stored = sourceFingerprint({ ...first, evaluationId: null })
      tx.$queryRaw.mockResolvedValue([
        {
          id,
          projectId,
          formId: null,
          type: 'PROJECT_SUMMARY',
          sourceFingerprint: stored,
          status: 'GENERATED',
        },
      ])
      await service.export(actor, projectId, id).catch((error: Error) => {
        expect(error.message).not.toContain('stale')
      })
      overview.readInTransaction.mockResolvedValue(budgetOverview('SUPPRESSED'))
      await expect(service.export(actor, projectId, id)).rejects.toThrow('Report source is stale')
    })
  })
})
