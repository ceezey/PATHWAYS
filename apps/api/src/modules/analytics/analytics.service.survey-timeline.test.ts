import { rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

import {
  actor,
  harness,
  orgA,
  orgB,
  pairedRows,
  projectA,
  projectB,
  releasedSaddd,
} from './analytics.service.harness'

describe('analytics descriptive views: survey and timeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy: computes survey pairing from the trusted aggregate, never from assessment rows', async () => {
    const rows = ['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pairedRows(id, 40, 60))
    const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: rows,
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    expect(result).toMatchObject({
      contractVersion: 'analytics.descriptive.survey.v1',
      overall: { pairs: { state: 'AVAILABLE', value: '5' } },
    })
    // Only the trusted aggregate function is called; assessment rows are never read.
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
          changes: expect.objectContaining({
            view: 'survey',
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
          }),
        }),
      }),
    )
  })

  it('happy: computes timeline adherence from the trusted activity/milestone aggregate', async () => {
    const activities = [
      {
        id: '40000000-0000-4000-8000-000000000011',
        organizationId: orgA,
        projectId: projectA,
        status: 'COMPLETED',
        archivedAt: null,
        plannedEndDate: new Date('2026-02-01'),
      },
      {
        id: '40000000-0000-4000-8000-000000000012',
        organizationId: orgA,
        projectId: projectA,
        status: 'IN_PROGRESS',
        archivedAt: null,
        plannedEndDate: new Date('2026-01-01'),
      },
    ]
    const milestones = [
      {
        status: 'COMPLETED',
        targetDate: new Date('2026-01-10'),
        completionDate: new Date('2026-01-10'),
      },
      { status: 'CANCELLED', targetDate: new Date('2020-01-01'), completionDate: null },
    ]
    const { service, tx } = harness(releasedSaddd, '2026-12-31', {
      activities,
      milestones,
      projectStatus: 'ONGOING',
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, { projectId: projectA, view: 'timeline' })
    expect(result).toMatchObject({
      contractVersion: 'analytics.descriptive.timeline.v1',
      activityCompletionPercent: { state: 'AVAILABLE', value: '50' },
      milestoneOnTimePercent: { state: 'AVAILABLE', value: '100' },
    })
    // Counts come from the trusted aggregate; activity and milestone rows are never read.
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
          changes: expect.objectContaining({ view: 'timeline' }),
        }),
      }),
    )
  })

  it('happy: a COMPLETED project gets its final position from the last-completion function', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2026-12-31', {
      projectStatus: 'COMPLETED',
      lastCompletion: new Date('2027-01-05'),
    })
    const result = await service.descriptive(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
      view: 'timeline',
    })
    expect(result).toMatchObject({
      elapsedPercent: { state: 'AVAILABLE', value: '100' },
      remainingDays: { state: 'ZERO', value: '0' },
      overdueDays: { state: 'AVAILABLE', value: '5' },
    })
    expect(sqlCalls.filter((sql) => sql.includes('p10_f9_timeline_last_completion'))).toHaveLength(
      1,
    )
  })

  it('happy: the last-completion function is not called for an ONGOING project', async () => {
    const { service, sqlCalls } = harness(releasedSaddd, '2026-12-31', {
      projectStatus: 'ONGOING',
    })
    await service.descriptive(actor('MONITORING_AND_EVALUATION_OFFICER'), {
      projectId: projectA,
      view: 'timeline',
    })
    expect(sqlCalls.some((sql) => sql.includes('p10_f9_timeline_last_completion'))).toBe(false)
  })

  it('sad: survey is MISSING (NO_PAIRED_ASSESSMENTS) rather than a fabricated zero when there is no data', async () => {
    const { service } = harness(releasedSaddd, '2026-06-30', { assessmentResults: [] })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    expect(result).toMatchObject({
      overall: {
        pairs: { state: 'ZERO', value: '0' },
        meanPre: { state: 'MISSING', reason: 'NO_PAIRED_ASSESSMENTS' },
      },
    })
  })

  it('sad: timeline is MISSING (NO_ACTIVITIES / NO_COMPLETED_MILESTONES) rather than a fabricated zero', async () => {
    const { service } = harness(releasedSaddd, '2026-06-30', {
      activities: [],
      milestones: [],
      projectStatus: 'ONGOING',
    })
    const identity = actor('MONITORING_AND_EVALUATION_OFFICER')
    const result = await service.descriptive(identity, { projectId: projectA, view: 'timeline' })
    expect(result).toMatchObject({
      activityCompletionPercent: { state: 'MISSING', reason: 'NO_ACTIVITIES' },
      milestoneOnTimePercent: { state: 'MISSING', reason: 'NO_COMPLETED_MILESTONES' },
    })
  })

  it('abuse: an out-of-scope project is denied for survey and timeline before any query', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER')
    await expect(
      service.descriptive(identity, {
        projectId: projectB,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      service.descriptive(identity, { projectId: projectB, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('abuse: a cross-org project is denied for survey and timeline before any query', async () => {
    const { service, tx } = harness()
    const identity = actor('PROJECT_MANAGER', { organizationId: orgB })
    await expect(
      service.descriptive(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
  })

  it('abuse: a Project Officer is denied survey and timeline (no analytics.descriptive.read)', async () => {
    const { service } = harness()
    const officer = actor('PROJECT_OFFICER')
    await expect(
      service.descriptive(officer, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.descriptive(officer, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('abuse: survey and timeline (read and export) require monitoring.read even with analytics.descriptive.read/export', async () => {
    const { service, tx } = harness()
    const noMonitoring = actor('PROJECT_MANAGER', {
      permissions: rolePermissions.PROJECT_MANAGER.filter((p) => p !== 'monitoring.read'),
    })
    expect(noMonitoring.permissions).toContain('analytics.descriptive.read')
    expect(noMonitoring.permissions).toContain('analytics.export')
    await expect(
      service.descriptive(noMonitoring, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.descriptive(noMonitoring, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.export(noMonitoring, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.export(noMonitoring, { projectId: projectA, view: 'timeline' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
    expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  describe('defined-period rule (adjacent-period differencing abuse)', () => {
    it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)(
      'abuse: %s custom or adjacent survey ranges refused by the aggregate function are a 400 on read and export, with no audit row',
      async (role) => {
        const { service, tx } = harness(releasedSaddd, '2026-06-30', {
          aggregateError: { code: 'P2010', meta: { code: '22023' } },
        })
        const identity = actor(role)
        for (const range of [
          { periodStart: '2026-03-01', periodEnd: '2026-03-31' },
          { periodStart: '2026-03-02', periodEnd: '2026-03-31' },
        ]) {
          await expect(
            service.descriptive(identity, { projectId: projectA, ...range, view: 'survey' }),
          ).rejects.toMatchObject({ status: 400 })
          await expect(
            service.export(identity, { projectId: projectA, ...range, view: 'survey' }),
          ).rejects.toMatchObject({ status: 400 })
        }
        expect(tx.auditLog.create).not.toHaveBeenCalled()
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
      },
    )

    it('sad: a survey request without a complete period is a 400 before the aggregate is called', async () => {
      const { service, sqlCalls } = harness()
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), { projectId: projectA, view: 'survey' }),
      ).rejects.toMatchObject({ status: 400 })
      expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(0)
    })

    it('sad: a 22023 from the timeline aggregate is not a client error (timeline takes no period)', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { code: 'P2010', meta: { code: '22023' } },
      })
      await expect(
        service.descriptive(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
    })
  })

  it('sad: an unexpected export retrieval failure is a 503, never a 500 or a client error', async () => {
    const { service, tx } = harness(releasedSaddd, '2026-06-30', {
      assessmentResults: [],
      aggregateError: {},
    })
    const identity = actor('PROJECT_MANAGER')
    await expect(
      service.export(identity, {
        projectId: projectA,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        view: 'survey',
      }),
    ).rejects.toMatchObject({ status: 503 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('happy: survey and timeline export as audited CSV with the suppression marker preserved', async () => {
    const rows = [...pairedRows('e1', 40, 60)]
    const { service, tx } = harness(releasedSaddd, '2026-06-30', { assessmentResults: rows })
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const csv = result.bytes.toString('utf8')
    expect(csv).toContain('"SURVEY"')
    expect(csv).toMatch(/"SUPPRESSED","","",?"SMALL_CELL"/)
    // One export audit row per export, carrying contract version, view and row count
    // (overall plus one per byActivity group for survey; six metrics for timeline).
    const survey = await service.descriptive(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const exported = () =>
      tx.auditLog.create.mock.calls
        .map((call: unknown[]) => (call[0] as { data: { action: string; changes: unknown } }).data)
        .filter((data: { action: string }) => data.action === 'ANALYTICS_DESCRIPTIVE_EXPORTED')
    expect(exported()).toHaveLength(1)
    expect(exported()[0].changes).toMatchObject({
      contractVersion: 'analytics.descriptive.survey.v1',
      format: 'CSV',
      view: 'survey',
      rowCount: (survey as { byActivity: unknown[] }).byActivity.length + 1,
    })
    const timelineResult = await service.export(identity, { projectId: projectA, view: 'timeline' })
    const timelineCsv = timelineResult.bytes.toString('utf8')
    expect(timelineCsv).toContain('"TIMELINE"')
    expect(exported()).toHaveLength(2)
    expect(exported()[1].changes).toMatchObject({
      contractVersion: 'analytics.descriptive.timeline.v1',
      format: 'CSV',
      view: 'timeline',
      rowCount: 6,
    })
  })

  it('abuse: CSV export withholds a whole byActivity breakdown when a group would leak a sub-count by subtraction', async () => {
    // act-A: 5 improved / 2 declined (7 pairs, visible on its own); act-B: 2 improved / 3
    // declined (5 pairs, its own group suppressed) -- without cross-group suppression on
    // improved/declined, act-B's split is recoverable as overall (7 improved / 5 declined)
    // minus act-A (5 / 2). The CSV must withhold every byActivity row, not just act-B's.
    const rows = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].flatMap((id) =>
        pairedRows(id, 40, 70, { activityId: 'act-A' }),
      ),
      ...['a6', 'a7'].flatMap((id) => pairedRows(id, 70, 40, { activityId: 'act-A' })),
      ...['b1', 'b2'].flatMap((id) => pairedRows(id, 40, 70, { activityId: 'act-B' })),
      ...['b3', 'b4', 'b5'].flatMap((id) => pairedRows(id, 70, 40, { activityId: 'act-B' })),
    ]
    const { service } = harness(releasedSaddd, '2026-06-30', { assessmentResults: rows })
    const identity = actor('PROJECT_MANAGER')
    const result = await service.export(identity, {
      projectId: projectA,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      view: 'survey',
    })
    const csv = result.bytes.toString('utf8')
    const activityLines = csv.split('\r\n').filter((line) => line.startsWith('"SURVEY","act-'))
    expect(activityLines.length).toBeGreaterThan(0)
    for (const line of activityLines) {
      expect(line).toMatch(/"SUPPRESSED","","",?"SMALL_CELL"/)
    }
  })
})
