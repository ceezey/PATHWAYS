import { BadRequestException } from '@nestjs/common'
import { type MonitoringDashboard, metricCellSchema } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { ApplicationIdentity } from '../auth/developer-access'
import { classifyScoreCommentary } from '../evaluations/evaluation-metrics'

export type ExtraReportKind = 'MONITORING_REPORT' | 'EVALUATION_REPORT'
export const isExtraReportKind = (kind: string): kind is ExtraReportKind =>
  kind === 'MONITORING_REPORT' || kind === 'EVALUATION_REPORT'
// Both extra kinds read monitoring data, so they also need monitoring.read on top of the kind grant.
export const extraKindRequires = {
  MONITORING_REPORT: 'monitoring.read',
  EVALUATION_REPORT: 'monitoring.read',
} as const

const day = (value: Date) => value.toISOString().slice(0, 10)
const MAX_SPAN_MS = 365 * 86_400_000

/** Fixed monitoring window: the project dates, clamped to the 366-day monitoring limit. */
export function monitoringReportPeriod(project: { startDate: Date | null; endDate: Date | null }) {
  if (!project.startDate || !project.endDate || project.endDate < project.startDate) return null
  const start = new Date(
    Math.max(project.startDate.getTime(), project.endDate.getTime() - MAX_SPAN_MS),
  )
  return { periodStart: day(start), periodEnd: day(project.endDate) }
}

const cellText = (input: unknown) => {
  const cell = metricCellSchema.parse(input)
  return [cell.value ?? 'Not available', cell.state, cell.reason ?? '']
}

/** Flattens the trusted, already-suppressed monitoring aggregate into report rows. */
export function monitoringReportTable(data: MonitoringDashboard) {
  const rows: string[][] = [['Period', `${data.periodStart} to ${data.periodEnd}`, '', '', '']]
  const add = (section: string, item: string, metric: unknown) =>
    rows.push([section, item, ...cellText(metric)])
  for (const b of data.activities) add('Activity status', b.label, b.metric)
  for (const b of data.milestones) add('Milestone status', b.label, b.metric)
  add('Participation', 'Participation records', data.participationRecords)
  for (const i of data.indicators) {
    add('Indicator current', `${i.code} ${i.name}`, i.current)
    add('Indicator progress', `${i.code} ${i.name}`, i.progress)
  }
  return { columns: ['Section', 'Item', 'Value', 'Metric state', 'Reason'], rows }
}

const snapshot = z
  .object({
    code: z.string(),
    name: z.string(),
    weight_percentage: z.union([z.string(), z.number()]),
    type: z.string().optional(),
  })
  .passthrough()

// Donor-facing source text; the internal markers and the evaluator's free-text note are never shown.
const sourceCell = (view: ReturnType<typeof classifyScoreCommentary>) =>
  view.source === 'computed'
    ? `Computed: ${view.evidence}`
    : view.source === 'no_data'
      ? `No data: ${view.reason}`
      : 'Manual score'

/** Latest signed-off or archived evaluation with its criterion scores, or an empty table. */
export async function evaluationReportTable(
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  projectId: string,
) {
  const columns = [
    'Section',
    'Criterion',
    'Weight percent',
    'Score',
    'Maximum score',
    'Weighted score',
    'Source',
  ]
  const evaluation = await tx.projectEvaluation.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      status: { in: ['SIGNED_OFF', 'ARCHIVED'] },
    },
    orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      overallScore: true,
    },
  })
  if (!evaluation) return { columns, rows: [] as string[][], evaluationId: null }
  const scores = await tx.projectEvaluationScore.findMany({
    where: { organizationId: actor.organizationId, projectId, evaluationId: evaluation.id },
    select: {
      score: true,
      maximumScore: true,
      weightedScore: true,
      commentary: true,
      criterionSnapshot: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 101,
  })
  if (scores.length > 100)
    throw new BadRequestException('Evaluation criteria exceed the report limit.')
  const rows = [
    [
      'Overall',
      `${evaluation.title} (${day(evaluation.periodStart)} to ${day(evaluation.periodEnd)}, ${evaluation.status})`,
      '',
      evaluation.overallScore?.toString() ?? 'Not available',
      '',
      '',
      '',
    ],
    ...scores.map((row, index) => {
      const meta = snapshot.safeParse(row.criterionSnapshot)
      const view = classifyScoreCommentary(
        row.commentary,
        meta.success ? (meta.data.type ?? '') : '',
      )
      return [
        'Criterion',
        meta.success ? `${meta.data.code} ${meta.data.name}` : `Criterion ${index + 1}`,
        meta.success ? String(meta.data.weight_percentage) : 'Not available',
        row.score.toString(),
        row.maximumScore.toString(),
        row.weightedScore.toString(),
        sourceCell(view),
      ]
    }),
  ]
  return { columns, rows, evaluationId: evaluation.id }
}
