// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  body,
  dashboards,
  id,
  project,
  projectId,
  service,
  state,
  storage,
  tx,
  useReportsHarness,
} from './reports.service.harness'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { generateReportRequest, reportPreviewQuery } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'

describe('report source authority, privacy and artifact recovery', () => {
  useReportsHarness()
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
          commentary: 'KPI achievement 80%',
          criterionSnapshot: { code: 'C1', name: 'Relevance', weight_percentage: '50' },
        },
      ])
      const preview = await service.preview(actor, projectId, { kind: 'EVALUATION_REPORT' })
      expect(preview.rows[1]).toEqual([
        'Criterion',
        'C1 Relevance',
        '50',
        '8',
        '10',
        '40',
        'Computed: KPI achievement 80%',
      ])
      expect(Object.keys(preview).sort()).toEqual(previewKeys)
      const where = tx.projectEvaluation.findFirst.mock.calls[0][0].where
      expect(where.status).toEqual({ in: ['SIGNED_OFF', 'ARCHIVED'] })
      await service.generate(actor, projectId, { ...body, kind: 'EVALUATION_REPORT' })
      const insert = tx.$executeRaw.mock.calls.find((call) =>
        call[0].join('').includes('INSERT INTO pathways.reports'),
      )
      expect(insert?.[11]).toBe(signedOff.id)
    })

    it('renders no-data and legacy manual scores without internal markers or notes', async () => {
      grant('monitoring.read')
      tx.projectEvaluation.findFirst.mockResolvedValue(signedOff)
      const row = (commentary: string | null, type: string) => ({
        score: { toString: () => '0' },
        maximumScore: { toString: () => '10' },
        weightedScore: { toString: () => '0' },
        commentary,
        criterionSnapshot: { code: 'C1', name: 'Relevance', weight_percentage: '50', type },
      })
      tx.projectEvaluationScore.findMany.mockResolvedValue([
        row(
          'No data: the enrolled count is below the small-cell reporting threshold (fewer than 5)',
          'BENEFICIARY_REACH',
        ),
        row('Not computable: old text Manual score recorded: private evaluator note', 'KPI'),
        row(null, 'BUDGET_EFFICIENCY'),
        row(null, 'BENEFICIARY_REACH'),
      ])
      const preview = await service.preview(actor, projectId, { kind: 'EVALUATION_REPORT' })
      expect(preview.rows[1][6]).toBe(
        'No data: the enrolled count is below the small-cell reporting threshold (fewer than 5)',
      )
      expect(preview.rows[2][6]).toBe('Manual score')
      expect(preview.rows[3][6]).toBe('Manual score')
      expect(preview.rows[4][6]).toBe('Manual score')
    })

    it('rejects an evaluation round on other kinds and accepts it on evaluation reports', () => {
      const evaluationId = '60000000-0000-4000-8000-000000000006'
      expect(reportPreviewQuery.safeParse({ kind: 'PROJECT_SUMMARY', evaluationId }).success).toBe(
        false,
      )
      expect(generateReportRequest.safeParse({ ...body, evaluationId }).success).toBe(false)
      expect(
        reportPreviewQuery.safeParse({ kind: 'EVALUATION_REPORT', evaluationId }).success,
      ).toBe(true)
      expect(
        generateReportRequest.safeParse({ ...body, kind: 'EVALUATION_REPORT', evaluationId })
          .success,
      ).toBe(true)
    })

    it('lists only signed-off and archived rounds, newest first, with an allowlist', async () => {
      grant('monitoring.read')
      tx.projectEvaluation.findMany.mockResolvedValue([
        { ...signedOff, signedOffAt: new Date('2026-10-07T01:00:00Z'), internal: 'x' },
      ])
      const rounds = await service.evaluationRounds(actor, projectId)
      const args = tx.projectEvaluation.findMany.mock.calls[0][0]
      expect(args.where.status).toEqual({ in: ['SIGNED_OFF', 'ARCHIVED'] })
      expect(args.orderBy).toEqual([{ periodEnd: 'desc' }, { id: 'desc' }])
      expect(rounds).toEqual([
        {
          id: signedOff.id,
          title: 'Midterm',
          status: 'SIGNED_OFF',
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          signedOffAt: '2026-10-07T01:00:00.000Z',
          overallScore: '82.5',
        },
      ])
    })

    it('refuses the rounds list without the evaluation report grants', async () => {
      await expect(service.evaluationRounds(actor, projectId)).rejects.toThrow(ForbiddenException)
      grant('monitoring.read')
      state.actor = {
        ...(state.actor as ApplicationIdentity),
        permissions: ['reports.read', 'monitoring.read'],
      }
      await expect(service.evaluationRounds(actor, projectId)).rejects.toThrow(ForbiddenException)
      expect(tx.projectEvaluation.findMany).not.toHaveBeenCalled()
    })

    it('previews and stores the chosen round, and yields no round for an unknown id', async () => {
      grant('monitoring.read')
      const evaluationId = '60000000-0000-4000-8000-000000000009'
      tx.projectEvaluation.findFirst.mockResolvedValueOnce(null)
      const none = await service.preview(actor, projectId, {
        kind: 'EVALUATION_REPORT',
        evaluationId,
      })
      expect(none.rows).toEqual([])
      expect(none.unavailableReasons).toHaveLength(1)
      tx.projectEvaluation.findFirst.mockResolvedValue({ ...signedOff, id: evaluationId })
      await service.generate(actor, projectId, { ...body, kind: 'EVALUATION_REPORT', evaluationId })
      const where = tx.projectEvaluation.findFirst.mock.lastCall?.[0].where
      expect(where).toMatchObject({ id: evaluationId, status: { in: ['SIGNED_OFF', 'ARCHIVED'] } })
      const insert = tx.$executeRaw.mock.calls.find((call) =>
        call[0].join('').includes('INSERT INTO pathways.reports'),
      )
      expect(insert?.[11]).toBe(evaluationId)
    })

    it('exports an older saved report against its own stored round', async () => {
      grant('monitoring.read')
      const older = { ...signedOff, id: '60000000-0000-4000-8000-000000000005' }
      tx.projectEvaluation.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) =>
          where.id ? (where.id === older.id ? older : null) : signedOff,
      )
      let fingerprint: unknown
      tx.$executeRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
        if (sql.join('').includes('INSERT INTO pathways.reports')) fingerprint = values[9]
        return 1
      })
      await service.generate(actor, projectId, {
        ...body,
        kind: 'EVALUATION_REPORT',
        evaluationId: older.id,
      })
      tx.$queryRaw.mockImplementation(
        async (sql: { strings?: string[]; join?: (separator: string) => string }) => {
          const text = sql.strings?.join('') ?? sql.join?.('') ?? ''
          return text.includes('FROM pathways.reports')
            ? [
                {
                  id,
                  projectId,
                  formId: null,
                  evaluationId: older.id,
                  type: 'EVALUATION_REPORT',
                  format: 'PDF',
                  status: 'GENERATED',
                  sourceFingerprint: fingerprint,
                  bucket: 'pathways-private',
                  key: 'organizations/synthetic/report.pdf',
                  sha: 'b'.repeat(64),
                  bytes: 12,
                  updatedAt: new Date(),
                },
              ]
            : [{ id }]
        },
      )
      const result = await service.export(actor, projectId, id)
      expect(result.fileName).toBe(`report-${id}.pdf`)
    })

    it('adds the round label to saved evaluation reports without other ids', async () => {
      grant('monitoring.read')
      tx.report.findMany.mockResolvedValue([
        {
          id,
          name: 'R',
          type: 'EVALUATION_REPORT',
          format: 'PDF',
          status: 'GENERATED',
          generatedAt: null,
          evaluation: {
            title: 'Midterm',
            periodStart: signedOff.periodStart,
            periodEnd: signedOff.periodEnd,
          },
        },
      ])
      const [row] = await service.list(actor, projectId)
      expect(row.evaluation).toEqual({
        title: 'Midterm',
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
      })
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
})
