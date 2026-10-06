import { Inject, Injectable } from '@nestjs/common'
import { kpiAchievement, numericMetric } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../auth/developer-access'
import { suppressSmallCount } from '../dashboards/descriptive-analytics'
import { IndicatorsService } from '../indicators/indicators.service'

type Tx = Prisma.TransactionClient

export const criterionTypes = [
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
  'INDICATOR_LINKAGE',
  'ASSESSMENT_GAIN',
  'OTHER',
] as const
export type CriterionType = (typeof criterionTypes)[number]

// A stored score is always a number; a criterion without data scores 0 and its commentary starts
// with the marker below so the reason survives a refetch.
export type ComputedScoreResult = { score: string; commentary: string }
export const noDataPrefix = 'No data: '

// Clamps an uncapped percentage to the 0-100 range a criterion score can represent.
const clampPercent = (value: string) => Math.max(0, Math.min(100, Number(value)))
const cappedNote = (value: string) => (Number(value) > 100 ? ', capped at 100%' : '')

// Scores and their weighted/overall totals are recomputed exactly in Postgres (p3_guard_score,
// p3_guard_evaluation) from this `score` value and the published criterion; this intermediate
// percent-to-score scaling only has to be stable to four decimal places.
const scaleToMax = (percent: number, maximumScore: string) =>
  ((percent / 100) * Number(maximumScore)).toFixed(4)

const noData = (reason: string): ComputedScoreResult => ({
  score: '0.0000',
  commentary: `${noDataPrefix}${reason}`,
})
const scored = (percent: number, maximumScore: string, evidence: string): ComputedScoreResult => ({
  score: scaleToMax(percent, maximumScore),
  commentary: evidence,
})
// Counts of 1-4 are suppressed like every other aggregate.
const smallCell = (count: number) =>
  suppressSmallCount(numericMetric(String(count))).state === 'SUPPRESSED'
const smallCellReason = (count: string) =>
  `the ${count} count is below the small-cell reporting threshold (fewer than 5)`

const manualMarker = ' Manual score recorded: '
// Splits stored commentary into the source, evidence, reason and manual note shown to readers.
export function classifyScoreCommentary(commentary: string | null, criterionType: string) {
  const text = commentary ?? ''
  const missing = text.startsWith(noDataPrefix)
  const marked = text.indexOf(manualMarker)
  const blank = text.trim() === ''
  // Rounds closed before automatic scoring, and scores written without commentary, are manual.
  const manual = !missing && (blank || criterionType === 'OTHER' || marked >= 0)
  const source = missing
    ? ('no_data' as const)
    : manual
      ? ('manual' as const)
      : ('computed' as const)
  return {
    source,
    evidence: source === 'computed' ? text : null,
    reason: missing ? text.slice(noDataPrefix.length) : null,
    note: manual && !blank ? (marked >= 0 ? text.slice(marked + manualMarker.length) : text) : null,
  }
}

type EvaluationProject = { id: string; targetBeneficiaries: number | null }
type Period = { start: string; end: string }
type Criterion = { id: string; type: CriterionType; maximumScore: string }

/**
 * Deterministic, data-backed scores for every default evaluation criterion type, derived only
 * from the selected project and the evaluation period. A criterion without usable data scores 0
 * with a labeled "No data" reason; the retired manual types (OTHER, BUDGET_EFFICIENCY) that only
 * remain in rounds opened before automatic scoring score 0 the same way.
 */
@Injectable()
export class EvaluationMetricsService {
  constructor(@Inject(IndicatorsService) private readonly indicators: IndicatorsService) {}

  // Scores every criterion in one pass; KPI achievement is read from the database at most once
  // per call because a project indicator query is slow enough to risk the statement timeout.
  async computeMany(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    period: Period,
    criteria: readonly Criterion[],
  ): Promise<Map<string, ComputedScoreResult>> {
    const kpi = criteria.some((row) => row.type === 'KPI')
      ? await this.kpiMetric(tx, actor, project.id)
      : null
    const results = new Map<string, ComputedScoreResult>()
    for (const { id, type, maximumScore } of criteria) {
      switch (type) {
        case 'KPI':
          results.set(id, this.scoreFromKpi(kpi as ReturnType<typeof kpiAchievement>, maximumScore))
          break
        case 'BENEFICIARY_REACH':
          results.set(id, await this.reach(tx, actor, project, period.end, maximumScore))
          break
        case 'TIMELINE_COMPLIANCE':
          results.set(id, await this.timeline(tx, actor, project, period.end, maximumScore))
          break
        case 'INDICATOR_LINKAGE':
          results.set(id, await this.linkage(tx, actor, project, maximumScore))
          break
        case 'ASSESSMENT_GAIN':
          results.set(id, await this.gain(tx, actor, project, period, maximumScore))
          break
        default:
          results.set(id, noData('criterion is no longer scored automatically'))
      }
    }
    return results
  }

  private async kpiMetric(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    const rows = await this.indicators.readInTransaction(tx, actor, [projectId])
    return kpiAchievement(rows.map((row) => row.progress))
  }

  private scoreFromKpi(
    { metric, indicatorCount, reportedCount }: ReturnType<typeof kpiAchievement>,
    maximumScore: string,
  ): ComputedScoreResult {
    if (metric.value === null)
      return noData(
        `no indicator progress is reported (${reportedCount} of ${indicatorCount} project indicators reporting)`,
      )
    return scored(
      clampPercent(metric.value),
      maximumScore,
      `KPI achievement ${metric.value}%${cappedNote(metric.value)}`,
    )
  }

  // Counts beneficiaries enrolled (active or completed) by the period end, not the SADDD reached
  // figure the project overview shows.
  private async reach(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    periodEnd: string,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    if (!project.targetBeneficiaries) return noData('the project has no target beneficiary count')
    const [row] = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(DISTINCT beneficiary_id)::integer AS count
      FROM pathways.beneficiary_project_enrollments
      WHERE organization_id = ${actor.organizationId}::uuid AND project_id = ${project.id}::uuid
        AND status IN ('ACTIVE', 'COMPLETED') AND enrollment_date <= ${periodEnd}::date`
    const enrolled = row?.count ?? 0
    if (smallCell(enrolled)) return noData(smallCellReason('enrolled'))
    const raw = ((enrolled / project.targetBeneficiaries) * 100).toFixed(4)
    return scored(
      clampPercent(raw),
      maximumScore,
      `Reach ${Math.round(Number(raw))}% of target${cappedNote(raw)}`,
    )
  }

  // Activities due by the period end that are complete. This is a delivery rate, not an on-time
  // rate: project_activities has no completion timestamp.
  private async timeline(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    periodEnd: string,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    const where = {
      organizationId: actor.organizationId,
      projectId: project.id,
      archivedAt: null,
      status: { not: 'CANCELLED' as const },
      plannedEndDate: { not: null, lte: new Date(`${periodEnd}T00:00:00.000Z`) },
    }
    const due = await tx.projectActivity.count({ where })
    if (due === 0) return noData('no activity is due by the period end')
    const done = await tx.projectActivity.count({ where: { ...where, status: 'COMPLETED' } })
    return scored(
      (done / due) * 100,
      maximumScore,
      `${done} of ${due} due ${due === 1 ? 'activity' : 'activities'} done`,
    )
  }

  // Share of live activities linked to at least one live indicator; a project-wide structure
  // measure, so it does not depend on the period.
  private async linkage(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    const where = {
      organizationId: actor.organizationId,
      projectId: project.id,
      archivedAt: null,
      status: { not: 'CANCELLED' as const },
    }
    const total = await tx.projectActivity.count({ where })
    if (total === 0) return noData('the project has no activities')
    const linked = await tx.projectActivity.count({
      where: {
        ...where,
        activityIndicatorLink_activity: { some: { indicator: { archivedAt: null } } },
      },
    })
    return scored(
      (linked / total) * 100,
      maximumScore,
      `${linked} of ${total} ${total === 1 ? 'activity' : 'activities'} linked`,
    )
  }

  // Share of paired pre/post assessments (latest of each per enrollment, dated inside the period)
  // that improved. Counted in SQL so no beneficiary row leaves the database; the survey aggregate
  // p10_f9_survey_aggregate is not used because it only answers for a defined indicator period.
  private async gain(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    period: Period,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    const [row] = await tx.$queryRaw<Array<{ pairs: number; improved: number }>>`
      WITH latest AS (
        SELECT DISTINCT ON (enrollment_id, type) enrollment_id, type, score / maximum_score AS ratio
        FROM pathways.assessment_results
        WHERE organization_id = ${actor.organizationId}::uuid AND project_id = ${project.id}::uuid
          AND type IN ('PRE_TEST', 'POST_TEST') AND enrollment_id IS NOT NULL
          AND assessment_date BETWEEN ${period.start}::date AND ${period.end}::date
          AND score <> 'NaN'::numeric AND maximum_score <> 'NaN'::numeric AND maximum_score > 0
        ORDER BY enrollment_id, type, assessment_date DESC, id DESC)
      SELECT count(*)::integer AS pairs, (count(*) FILTER (WHERE post.ratio > pre.ratio))::integer AS improved
      FROM latest pre JOIN latest post
        ON post.enrollment_id = pre.enrollment_id AND pre.type = 'PRE_TEST' AND post.type = 'POST_TEST'`
    const pairs = row?.pairs ?? 0
    const improved = row?.improved ?? 0
    if (pairs === 0) return noData('no paired pre/post assessments in the period')
    if (smallCell(pairs)) return noData(smallCellReason('paired assessment'))
    if (smallCell(improved)) return noData(smallCellReason('improved assessment'))
    if (smallCell(pairs - improved)) return noData(smallCellReason('not-improved assessment'))
    return scored(
      (improved / pairs) * 100,
      maximumScore,
      `Improved in ${improved} of ${pairs} paired assessments`,
    )
  }
}
