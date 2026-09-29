import { createHash } from 'node:crypto'
import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { StorageService } from '../storage/storage.service'
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
}
const tx = {
  project: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  auditLog: { create: vi.fn() },
  report: { findMany: vi.fn() },
}
const storage = { uploadPrivateFile: vi.fn(), deleteFile: vi.fn() }
const service = new ReportsService({} as PrismaService, storage as unknown as StorageService)
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
    tx.project.findFirst.mockResolvedValue(project)
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
    expect(retry).toEqual(first)
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
})
