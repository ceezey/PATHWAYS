import {
  type MetricCell,
  activityObservation,
  businessCalendarDate,
  rolePermissions,
} from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

import {
  actor,
  harness,
  orgA,
  pairedRows,
  projectA,
  releasedSaddd,
} from './analytics.service.harness'

describe('analytics descriptive views: survey and timeline', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('trusted aggregates for aggregate-only roles', () => {
    const fivePairs = () => ['e1', 'e2', 'e3', 'e4', 'e5'].flatMap((id) => pairedRows(id, 40, 60))
    const period = { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
    const activityFixture = (status: string, plannedEnd: string | null, archived = false) => ({
      status,
      archivedAt: archived ? new Date('2026-01-01') : null,
      plannedEndDate: plannedEnd ? new Date(plannedEnd) : null,
    })

    it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
      'happy: %s receives the frozen closed-period survey release on read and export, one audit row each',
      async (role) => {
        expect(rolePermissions[role]).not.toContain('assessments.detail.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
          assessmentResults: fivePairs(),
        })
        const identity = actor(role)
        const closed = { periodStart: '2025-01-01', periodEnd: '2025-12-31' }
        const read = (await service.descriptive(identity, {
          projectId: projectA,
          ...closed,
          view: 'survey',
        })) as { overall: { pairs: MetricCell } }
        expect(read.overall.pairs).toMatchObject({ state: 'AVAILABLE', value: '5' })
        expect(read).not.toHaveProperty('releaseState')
        await service.export(identity, { projectId: projectA, ...closed, view: 'survey' })
        expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_release'))).toHaveLength(2)
        expect(sqlCalls.some((sql) => sql.includes('p10_f9_survey_aggregate'))).toBe(false)
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
        expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
      },
    )

    it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
      'abuse: %s is refused an open-period survey with a 400 before any survey query and no audit row',
      async (role) => {
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
          assessmentResults: fivePairs(),
        })
        const identity = actor(role)
        const open = {
          periodStart: '2026-01-01',
          periodEnd: businessCalendarDate(new Date(), 'Asia/Manila'),
        }
        await expect(
          service.descriptive(identity, { projectId: projectA, ...open, view: 'survey' }),
        ).rejects.toMatchObject({ status: 400 })
        await expect(
          service.export(identity, { projectId: projectA, ...open, view: 'survey' }),
        ).rejects.toMatchObject({ status: 400 })
        expect(sqlCalls.some((sql) => sql.includes('p10_f9_survey'))).toBe(false)
        expect(tx.auditLog.create).not.toHaveBeenCalled()
      },
    )

    it('sad: a database 22023 on the release function is a 400 for an aggregate-only role', async () => {
      const { service, tx } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { code: 'P2010', meta: { code: '22023' } },
      })
      await expect(
        service.descriptive(actor('GRANT_MANAGER'), {
          projectId: projectA,
          periodStart: '2025-03-01',
          periodEnd: '2025-03-31',
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)(
      'happy: %s (holds assessments.detail.read) still receives real survey aggregates on read and export',
      async (role) => {
        expect(rolePermissions[role]).toContain('assessments.detail.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
          assessmentResults: fivePairs(),
        })
        const identity = actor(role)
        const read = (await service.descriptive(identity, {
          projectId: projectA,
          ...period,
          view: 'survey',
        })) as { overall: { pairs: MetricCell; meanPre: MetricCell; meanPost: MetricCell } }
        expect(read.overall.pairs).toMatchObject({ state: 'AVAILABLE', value: '5' })
        expect(read.overall.meanPre.value).toBe('40')
        expect(read.overall.meanPost.value).toBe('60')
        const csv = (
          await service.export(identity, { projectId: projectA, ...period, view: 'survey' })
        ).bytes.toString('utf8')
        expect(csv).toMatch(
          /"SURVEY","OVERALL","All activities \(cohort change\) - Paired assessments","AVAILABLE","5"/,
        )
        expect(sqlCalls.filter((sql) => sql.includes('p10_f9_survey_aggregate'))).toHaveLength(2)
        expect(tx.assessmentResult.findMany).not.toHaveBeenCalled()
        expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
      },
    )

    it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
      'happy: %s receives real timeline aggregates on read and export, not "No activities recorded yet"',
      async (role) => {
        expect(rolePermissions[role]).toContain('activities.read')
        const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-12-31', {
          activities: [
            activityFixture('COMPLETED', '2026-02-01'),
            activityFixture('IN_PROGRESS', '2026-01-01'),
            activityFixture('NOT_STARTED', '2099-01-01'),
            activityFixture('CANCELLED', '2020-01-01'),
            activityFixture('IN_PROGRESS', '2020-01-01', true),
          ],
          milestones: [
            {
              status: 'COMPLETED',
              targetDate: new Date('2026-01-10'),
              completionDate: new Date('2026-01-09'),
              archivedAt: null,
            },
          ],
          projectStatus: 'ONGOING',
        })
        const identity = actor(role)
        const read = (await service.descriptive(identity, {
          projectId: projectA,
          view: 'timeline',
        })) as {
          activityCompletionPercent: MetricCell
          activityOverdueCount: MetricCell
          milestoneOnTimePercent: MetricCell
        }
        // 3 eligible (cancelled and archived excluded), 1 completed, 1 overdue.
        expect(read.activityCompletionPercent).toMatchObject({
          state: 'AVAILABLE',
          value: '33.3333',
        })
        expect(read.activityOverdueCount).toMatchObject({ state: 'AVAILABLE', value: '1' })
        expect(read.milestoneOnTimePercent).toMatchObject({ state: 'AVAILABLE', value: '100' })
        const csv = (
          await service.export(identity, { projectId: projectA, view: 'timeline' })
        ).bytes.toString('utf8')
        expect(csv).toContain('"Overdue activities","AVAILABLE","1"')
        expect(sqlCalls.filter((sql) => sql.includes('p10_f9_timeline_aggregate'))).toHaveLength(2)
        expect(tx.projectActivity.findMany).not.toHaveBeenCalled()
        expect(tx.projectMilestone.findMany).not.toHaveBeenCalled()
      },
    )

    it('abuse: a Project Officer is denied survey and timeline read and export before any aggregate call', async () => {
      const { service, sqlCalls } = harness()
      const officer = actor('PROJECT_OFFICER')
      for (const view of ['survey', 'timeline'] as const) {
        await expect(
          service.descriptive(officer, { projectId: projectA, ...period, view }),
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          service.export(officer, { projectId: projectA, ...period, view }),
        ).rejects.toMatchObject({ status: 403 })
      }
      expect(sqlCalls.some((sql) => sql.includes('p10_f9'))).toBe(false)
    })

    it('guard order: monitoring permission, then project scope, then the aggregate call, then audit', async () => {
      const { service, tx, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
        assessmentResults: fivePairs(),
      })
      await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      const scopeOrder = tx.project.findFirst.mock.invocationCallOrder[0] ?? 0
      const aggregateOrder =
        tx.$queryRaw.mock.invocationCallOrder[
          sqlCalls.findIndex((sql) => sql.includes('p10_f9_survey_aggregate'))
        ] ?? 0
      const auditOrder = tx.auditLog.create.mock.invocationCallOrder[0] ?? 0
      expect(scopeOrder).toBeGreaterThan(0)
      expect(aggregateOrder).toBeGreaterThan(scopeOrder)
      expect(auditOrder).toBeGreaterThan(aggregateOrder)
    })

    it('abuse: the function guard denial (42501) is a 403 and writes no audit row', async () => {
      const { service, tx } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { meta: { code: '42501' } },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        service.export(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 403 })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    it('sad: a statement timeout on the aggregate is a 503, never an empty or partial view', async () => {
      const { service, tx } = harness(releasedSaddd, '2026-06-30', {
        aggregateError: { meta: { code: '57014' } },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.descriptive(actor('GRANT_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.export(actor('PROGRAM_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    it('sad: a statement_timeout is set before the aggregate function runs', async () => {
      const { service, sqlCalls } = harness(releasedSaddd, '2026-06-30', {
        assessmentResults: fivePairs(),
      })
      await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      const timeout = sqlCalls.findIndex((sql) => sql.includes("set_config('statement_timeout'"))
      const aggregate = sqlCalls.findIndex((sql) => sql.includes('p10_f9_survey_aggregate'))
      expect(timeout).toBeGreaterThanOrEqual(0)
      expect(aggregate).toBeGreaterThan(timeout)
    })

    it('sad: a malformed aggregate from the database is a 503, never a fabricated view', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        surveyAggregate: { excludedRecords: 0, groups: [{ activityId: null, pairs: 'x' }] },
        timelineAggregate: { activities: {}, milestones: {} },
      })
      await expect(
        service.descriptive(actor('PROJECT_MANAGER'), {
          projectId: projectA,
          ...period,
          view: 'survey',
        }),
      ).rejects.toMatchObject({ status: 503 })
      await expect(
        service.descriptive(actor('PROGRAM_MANAGER'), { projectId: projectA, view: 'timeline' }),
      ).rejects.toMatchObject({ status: 503 })
    })

    it('happy: the API releases a small survey aggregate exactly (3 pairs)', async () => {
      const { service } = harness(releasedSaddd, '2026-06-30', {
        surveyAggregate: {
          excludedRecords: 1,
          groups: [
            {
              activityId: null,
              pairs: 3,
              sumPre: 120,
              sumPost: 180,
              improved: 3,
              same: 0,
              declined: 0,
            },
          ],
        },
      })
      const result = await service.descriptive(actor('PROJECT_MANAGER'), {
        projectId: projectA,
        ...period,
        view: 'survey',
      })
      expect(result).toMatchObject({
        excludedRecords: 1,
        overall: {
          pairs: { state: 'AVAILABLE', value: '3', reason: null },
          meanPre: { state: 'AVAILABLE', value: '40' },
        },
      })
    })

    it('parity: the SQL aggregate mirror reproduces the rule-engine activity observation', async () => {
      const cases = [
        [activityFixture('COMPLETED', '2026-02-01'), activityFixture('IN_PROGRESS', '2026-01-01')],
        [activityFixture('IN_PROGRESS', null), activityFixture('COMPLETED', null)],
        [activityFixture('CANCELLED', '2020-01-01'), activityFixture('NOT_STARTED', '2026-12-31')],
        [activityFixture('IN_PROGRESS', '2026-12-30', true)],
        [],
      ]
      for (const activities of cases) {
        const { service } = harness(releasedSaddd, '2026-12-31', {
          activities,
          milestones: [],
          projectStatus: 'ONGOING',
        })
        const result = (await service.descriptive(actor('PROGRAM_MANAGER'), {
          projectId: projectA,
          view: 'timeline',
        })) as { activityCompletionPercent: MetricCell; activityOverdueCount: MetricCell }
        const reportingDate = businessCalendarDate(new Date(), 'Asia/Manila')
        const members = activities.map((a, index) => ({
          id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          organizationId: orgA,
          projectId: projectA,
          revision: '1',
          status: a.status,
          archived: a.archivedAt !== null,
          plannedEndDate: a.plannedEndDate ? a.plannedEndDate.toISOString().slice(0, 10) : null,
        }))
        const base = {
          scope: { organizationId: orgA, projectId: projectA },
          conditionId: 'analytics-timeline-view',
          asOf: new Date().toISOString(),
          reportingDate,
          populationRevision: '1',
          activities: members,
        }
        const completion = activityObservation({
          ...base,
          metric: 'ACTIVITY_COMPLETION_PERCENT',
        }).cell
        const overdue = activityObservation({ ...base, metric: 'ACTIVITY_OVERDUE_COUNT' }).cell
        const remap = (cell: MetricCell) =>
          cell.reason === 'EMPTY_POPULATION' ? { ...cell, reason: 'NO_ACTIVITIES' } : cell
        expect(result.activityCompletionPercent).toEqual(remap(completion))
        expect(result.activityOverdueCount).toEqual(remap(overdue))
      }
    })
  })
})
