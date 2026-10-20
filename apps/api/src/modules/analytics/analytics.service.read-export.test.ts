import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { type MetricCell, descriptiveAnalyticsSchema, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { suppressSmallCount } from '../dashboards/dashboards.helpers'
import * as reportArtifact from '../reports/report-artifact'
import { analyticsTableCsv, descriptiveAnalyticsTable } from './analytics-export.helpers'
import { AnalyticsController } from './analytics.controller'
import { buildDescriptiveAnalytics } from './descriptive-analytics.helpers'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

import {
  actor,
  bucket,
  cell,
  descriptive,
  exportText,
  harness,
  orgA,
  projectA,
  projectB,
  releasedSaddd,
  suppressed,
  suppressedSaddd,
  userId,
} from './analytics.service.harness'

describe('analytics descriptive read and export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gates the routes with the dedicated permissions', () => {
    const meta = (method: keyof AnalyticsController) =>
      Reflect.getMetadata(PERMISSION_KEY, AnalyticsController.prototype[method])
    expect(meta('descriptive')).toBe('analytics.descriptive.read')
    expect(meta('export')).toBe('analytics.export')
  })

  it('happy: returns counts, distributions, shares and per-unit means from aggregates', async () => {
    const { service, tx } = harness()
    const result = await descriptive(service, actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
    })
    expect(descriptiveAnalyticsSchema.safeParse(result).success).toBe(true)
    expect(withAuthorizedOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'analytics.descriptive.read',
      expect.any(Function),
    )
    const sex = result.distributions.filter((row) => row.section === 'SADDD_SEX')
    expect(sex.map((row) => row.share)).toEqual(['0.6', '0.4'])
    expect(
      result.distributions.filter((row) => row.section === 'SADDD_AGE').map((r) => r.key),
    ).toEqual(['10-14', '18-24'])
    expect(result.indicatorSummaries).toEqual([
      expect.objectContaining({
        unitLabel: 'people',
        reportedCount: 2,
        mean: '15',
        minimum: '10',
        maximum: '20',
      }),
      expect.objectContaining({ unitLabel: 'sessions', reportedCount: 0, mean: null }),
    ])
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('happy: export writes an audit record and returns aggregate CSV only', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, { projectId: projectA })
    expect(result.contentType).toBe('text/csv; charset=utf-8')
    const csv = result.bytes.toString('utf8')
    expect(csv.split('\r\n')[0]).toBe('"section","key","label","state","value","share","reason"')
    expect(csv).toContain('"SADDD_SEX","FEMALE","FEMALE","AVAILABLE","18","0.6",""')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        projectId: projectA,
        actorUserId: userId,
        action: 'ANALYTICS_DESCRIPTIVE_EXPORTED',
        entityType: 'Project',
        entityId: projectA,
      }),
    })
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('happy: export renders XLSX with the chosen format in the audit record', async () => {
    const { service, tx } = harness()
    const result = await service.export(actor('PROJECT_MANAGER'), {
      projectId: projectA,
      format: 'XLSX',
    })
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(result.fileName).toMatch(/\.xlsx$/)
    expect(result.bytes.subarray(0, 2).toString('utf8')).toBe('PK')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ changes: expect.objectContaining({ format: 'XLSX' }) }),
    })
  })

  it('happy: preview returns the exported table rows without an export audit record', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER')
    const preview = await service.exportPreview(identity, { projectId: projectA })
    const csvLines = (await exportText(service, identity)).split('\r\n').filter(Boolean)
    expect(preview.columns).toEqual([
      'section',
      'key',
      'label',
      'state',
      'value',
      'share',
      'reason',
    ])
    expect(preview.totalRows).toBe(csvLines.length - 1)
    expect(preview.rows.length).toBeLessThanOrEqual(50)
    expect(preview.rows).toContainEqual([
      'SADDD_SEX',
      'FEMALE',
      'FEMALE',
      'AVAILABLE',
      '18',
      '0.6',
      '',
    ])
    // The preview is audited as a view; only the file export writes the export row.
    const calls = tx.auditLog.create.mock.calls as unknown as Array<
      [{ data: { action: string; changes: unknown } }]
    >
    const actions = calls.map(([call]) => call.data.action)
    expect(actions).toEqual(['ANALYTICS_DESCRIPTIVE_VIEWED', 'ANALYTICS_DESCRIPTIVE_EXPORTED'])
    expect(calls[0]?.[0].data.changes).toMatchObject({
      source: 'EXPORT_PREVIEW',
    })
  })

  it('happy: preview caps rows at 50 and reports the full row count', async () => {
    const group = (n: number) => ({
      activityId: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      pairs: 20,
      sumPre: 1000,
      sumPost: 1400,
      improved: 15,
      same: 3,
      declined: 2,
    })
    const { service } = harness(releasedSaddd, '2026-06-30', {
      surveyAggregate: {
        excludedRecords: 0,
        groups: [
          { ...group(0), activityId: null },
          ...Array.from({ length: 60 }, (_, i) => group(i + 1)),
        ],
      },
    })
    const preview = await service.exportPreview(actor('PROJECT_MANAGER'), {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    expect(preview.rows).toHaveLength(50)
    expect(preview.totalRows).toBeGreaterThan(50)
  })

  it('abuse: preview keeps small-cell suppression and needs analytics.export', async () => {
    const { service } = harness(suppressedSaddd)
    const preview = await service.exportPreview(actor('PROGRAM_MANAGER'), { projectId: projectA })
    const sadddRows = preview.rows.filter((row) => row[0].startsWith('SADDD_'))
    expect(sadddRows).toHaveLength(6)
    for (const row of sadddRows) expect(row.slice(3)).toEqual(['SUPPRESSED', '', '', 'SMALL_CELL'])
    const readOnly = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter((p) => p !== 'analytics.export'),
    })
    await expect(service.exportPreview(readOnly, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('sad: a typed 503 keeps its specific message and a file render fault names the format', async () => {
    const timeout = harness(releasedSaddd, '2026-06-30', {
      aggregateError: { meta: { code: '57014' } },
    })
    await expect(
      timeout.service.export(actor('PROGRAM_MANAGER'), { projectId: projectA, view: 'timeline' }),
    ).rejects.toThrow(/exceeded its query limit/)
    vi.spyOn(reportArtifact, 'createReportArtifact').mockRejectedValueOnce(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    )
    const { service } = harness()
    await expect(
      service.export(actor('PROJECT_MANAGER'), { projectId: projectA, format: 'PDF' }),
    ).rejects.toMatchObject({
      status: 503,
      message: 'The PDF file could not be generated on this server. Export CSV instead.',
    })
  })

  it('sad: rejects an unsupported export format before any transaction', async () => {
    const { service } = harness()
    await expect(
      service.export(actor('PROJECT_MANAGER'), { projectId: projectA, format: 'DOCX' }),
    ).rejects.toMatchObject({ status: 400 })
    expect(withAuthorizedOperation).not.toHaveBeenCalled()
  })

  it('sad: rejects missing, malformed or partial-period queries before any transaction', async () => {
    const { service } = harness()
    const identity = actor('PROJECT_MANAGER')
    await expect(service.descriptive(identity, {})).rejects.toMatchObject({ status: 400 })
    await expect(service.descriptive(identity, { projectId: 'x' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      service.export(identity, { projectId: projectA, periodStart: '2026-01-01' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      service.descriptive(identity, { projectId: projectA, sex: 'FEMALE' }),
    ).rejects.toMatchObject({ status: 400 })
    expect(withAuthorizedOperation).not.toHaveBeenCalled()
  })

  it('abuse: suppression holds in the read and in the exported CSV', async () => {
    const { service } = harness(suppressedSaddd)
    const identity = actor('PROGRAM_MANAGER')
    const result = await descriptive(service, identity, { projectId: projectA })
    const saddd = result.distributions.filter((row) => row.section.startsWith('SADDD_'))
    expect(saddd.length).toBeGreaterThan(0)
    for (const row of saddd) {
      expect(row.metric).toEqual(suppressed)
      expect(row.share).toBeNull()
    }
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric).toEqual(suppressed)
    const csv = await exportText(service, identity)
    const sadddLines = csv.split('\r\n').filter((line) => line.startsWith('"SADDD_'))
    expect(sadddLines).toHaveLength(6)
    for (const line of sadddLines) expect(line).toMatch(/,"SUPPRESSED","","","SMALL_CELL"$/)
    expect(csv).not.toMatch(/Synthetic project|beneficiar(y|ies)Id|dateOfBirth/i)
  })

  it('abuse: a partially suppressed section withholds every share', async () => {
    const { service } = harness({
      ...releasedSaddd,
      sex: [bucket('FEMALE', cell(27)), bucket('MALE', suppressed)],
    })
    const result = await descriptive(service, actor('GRANT_MANAGER'), { projectId: projectA })
    const sex = result.distributions.filter((row) => row.section === 'SADDD_SEX')
    expect(sex.map((row) => row.share)).toEqual([null, null])
  })

  it('happy: an ongoing project releases SADDD live to date', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2099-12-31')
    const result = await descriptive(service, actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(result.sadddReleaseState).not.toBe('UNAVAILABLE')
    expect(result.distributions.some((row) => row.section.startsWith('SADDD_'))).toBe(true)
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(true)
  })

  it('sad: a not-started project omits SADDD instead of calling the release', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2099-12-31', {
      projectStart: '2098-01-01',
    })
    const result = await descriptive(service, actor('PROJECT_MANAGER'), { projectId: projectA })
    expect(result.sadddReleaseState).toBe('UNAVAILABLE')
    expect(result.distributions.some((row) => row.section.startsWith('SADDD_'))).toBe(false)
    expect(sqlCalls.some((sql) => sql.includes('p06_saddd'))).toBe(false)
  })

  it('sad: an unexpected retrieval failure is a 503, never a 400 client error', async () => {
    const { service, tx } = harness()
    tx.project.findFirst.mockRejectedValueOnce(new Error('connection reset'))
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    await expect(
      service.descriptive(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('abuse: another organization project is out of scope before any aggregate is read', async () => {
    const { service, sqlCalls, tx } = harness()
    const identity = actor('SYSTEM_ADMINISTRATOR')
    await expect(service.descriptive(identity, { projectId: projectB })).rejects.toMatchObject({
      status: 404,
    })
    await expect(service.export(identity, { projectId: projectB })).rejects.toMatchObject({
      status: 404,
    })
    expect(sqlCalls.some((sql) => sql.includes('p06_'))).toBe(false)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    const where = tx.project.findMany.mock.calls[0]?.[0].where
    expect(where.AND[0]).toMatchObject({ organizationId: orgA })
  })

  it('abuse: an unassigned project in the same organization is out of scope', async () => {
    const { service } = harness()
    const identity = actor('PROJECT_MANAGER', { assignedProjectIds: [] })
    await expect(service.descriptive(identity, { projectId: projectA })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('abuse: roles without the permission are denied read and export', async () => {
    const { service, tx } = harness()
    const officer = actor('PROJECT_OFFICER')
    expect(officer.permissions).not.toContain('analytics.descriptive.read')
    expect(officer.permissions).not.toContain('analytics.export')
    await expect(service.descriptive(officer, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    await expect(service.export(officer, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    const readOnly = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter((p) => p !== 'analytics.export'),
    })
    await expect(service.descriptive(readOnly, { projectId: projectA })).resolves.toBeTruthy()
    await expect(service.export(readOnly, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    const exportOnly = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter(
        (p) => p !== 'analytics.descriptive.read',
      ),
    })
    await expect(service.export(exportOnly, { projectId: projectA })).rejects.toMatchObject({
      status: 403,
    })
    // Every forbidden attempt above is blocked before any query or audit write; only the
    // one successful read (readOnly, above) is audited.
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ANALYTICS_DESCRIPTIVE_VIEWED' }),
      }),
    )
  })

  it('abuse: CSV neutralizes spreadsheet formulas in labels', () => {
    const csv = analyticsTableCsv(
      descriptiveAnalyticsTable({
        contractVersion: 'analytics.descriptive.v1',
        projectId: projectA,
        generatedAt: '2026-09-28T00:00:00.000Z',
        monitoringPeriod: {
          periodStart: '2026-09-01',
          periodEnd: '2026-09-28',
          businessTimeZone: 'UTC',
        },
        sadddPeriod: { periodStart: null, periodEnd: null },
        sadddReleaseState: 'UNAVAILABLE',
        privacy: {
          threshold: 5,
          complementarySuppression: true,
          source: 'P06_SADDD_RELEASE',
          beneficiaryRows: false,
        },
        counts: [],
        distributions: [
          {
            section: 'ACTIVITY_STATE',
            key: 'X',
            label: '=HYPERLINK("x")',
            metric: cell(6),
            share: '1',
          },
        ],
        indicatorSummaries: [],
      }),
    )
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('descriptive analytics small-cell and complementary suppression', () => {
  const monitoringWith = (value: number) =>
    ({
      contractVersion: 'p06.v1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-28',
      businessTimeZone: 'Asia/Manila',
      generatedAt: '2026-09-28T00:00:00.000Z',
      refresh: 'READ_TIME_NO_CACHE',
      projects: [],
      scopeProjectCount: 1,
      activities: [],
      milestones: [],
      participationRecords: cell(value),
      attendingIndividuals: cell(value),
      enrolledBeneficiaryRecords: cell(value),
      enrolledIndividuals: cell(value),
      indicators: [],
      indicatorNote: 'n',
    }) as never
  const sadddWith = (total: MetricCell) =>
    ({
      ...releasedSaddd,
      contractVersion: 'p06.v1',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      businessTimeZone: 'Asia/Manila',
      generatedAt: '2026-09-28T00:00:00.000Z',
      refresh: 'READ_TIME_NO_CACHE',
      total,
    }) as never
  const personKeys = [
    'participationRecords',
    'attendingIndividuals',
    'enrolledBeneficiaryRecords',
    'enrolledIndividuals',
  ]
  const build = (value: number, saddd: unknown = null) =>
    buildDescriptiveAnalytics({
      projectId: projectA,
      monitoring: monitoringWith(value),
      saddd: saddd as never,
      generatedAt: '2026-09-28T00:00:00.000Z',
    })

  it.each([
    [0, 'ZERO', '0'],
    [1, 'SUPPRESSED', null],
    [4, 'SUPPRESSED', null],
    [5, 'AVAILABLE', '5'],
  ])(
    'count %i is %s in the read and the CSV for every person-derived count',
    (value, state, shown) => {
      const result = build(value)
      const csv = analyticsTableCsv(descriptiveAnalyticsTable(result))
      for (const key of personKeys) {
        const row = result.counts.find((candidate) => candidate.key === key)
        expect(row?.metric.state).toBe(state)
        expect(row?.metric.value).toBe(shown)
        expect(csv).toContain(`"COUNT","${key}",`)
        const line = csv.split('\r\n').find((l) => l.startsWith(`"COUNT","${key}",`))
        expect(line).toContain(`"${state}","${shown ?? ''}"`)
      }
      expect(suppressSmallCount(cell(value)).state).toBe(state)
    },
  )

  it('reconstruction: a suppressed SADDD total suppresses every paired monitoring count', () => {
    const result = build(37, sadddWith(suppressed))
    const csv = analyticsTableCsv(descriptiveAnalyticsTable(result))
    expect(result.counts.find((row) => row.key === 'enrolledIndividuals')).toBeUndefined()
    for (const key of [
      'participationRecords',
      'attendingIndividuals',
      'enrolledBeneficiaryRecords',
    ]) {
      const row = result.counts.find((candidate) => candidate.key === key)
      expect(row?.metric).toEqual({
        state: 'SUPPRESSED',
        value: null,
        reason: 'COMPLEMENTARY_SUPPRESSION',
      })
    }
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric).toEqual(suppressed)
    const visibleCounts = result.counts.filter(
      (row) => row.key !== 'indicatorDefinitions' && row.metric.value !== null,
    )
    expect(visibleCounts).toEqual([])
    expect(csv).not.toContain('"37"')
    expect(csv).not.toContain('"enrolledIndividuals"')
  })

  it('omits the duplicate monitoring individual total when SADDD is released', () => {
    const result = build(37, sadddWith(cell(30)))
    expect(result.counts.map((row) => row.key)).not.toContain('enrolledIndividuals')
    expect(result.counts.find((row) => row.key === 'sadddTotal')?.metric.value).toBe('30')
    expect(result.counts.find((row) => row.key === 'attendingIndividuals')?.metric.value).toBe('37')
  })
})
