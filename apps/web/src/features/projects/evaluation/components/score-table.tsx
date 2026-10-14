'use client'

import { StatusBadge } from '@/components/pathways'
import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'
import { metricGlossary } from '@/constants/metric-glossary'
import { type EvaluationDetail, orderOf, points } from '../evaluation.utils'

export function ScoreTable({ evaluation }: { evaluation: EvaluationDetail }) {
  const scores = [...evaluation.scores].sort(
    (a, b) => orderOf(a) - orderOf(b) || a.criterion.name.localeCompare(b.criterion.name),
  )
  const missing = scores.filter((row) => row.source === 'no_data').length
  const overall =
    evaluation.overallScore ??
    (scores.length ? scores.reduce((sum, row) => sum + Number(row.weightedScore), 0) : null)
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th className={stickyTableHeadClass}>
              Criterion
              <MetricTooltip label="Criterion">{metricGlossary.criterion}</MetricTooltip>
            </th>
            <th className={stickyTableHeadClass}>
              Weight
              <MetricTooltip label="Weight">{metricGlossary.weight}</MetricTooltip>
            </th>
            <th className={stickyTableHeadClass}>
              Score
              <MetricTooltip label="Score">{metricGlossary.score}</MetricTooltip>
            </th>
            <th className={stickyTableHeadClass}>
              Source
              <MetricTooltip label="Source">{metricGlossary.scoreSource}</MetricTooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => (
            <tr key={row.criterionId} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">{row.criterion.name}</td>
              <td className="px-4 py-3">{points(row.criterion.weight_percentage)}%</td>
              <td className="px-4 py-3">
                {points(row.score)} / {points(row.maximumScore)}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {row.source === 'no_data' ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <StatusBadge tone="warning">No data</StatusBadge>
                    {row.reason}
                  </span>
                ) : row.source === 'manual' ? (
                  `Manual score: ${row.note ?? 'no note'}`
                ) : (
                  row.evidence
                )}
              </td>
            </tr>
          ))}
          {overall !== null ? (
            <tr className="bg-surface-subtle font-semibold text-foreground">
              <td className="px-4 py-3">
                Overall
                <MetricTooltip label="Overall score">{metricGlossary.overallScore}</MetricTooltip>
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3">{points(overall)} / 100</td>
              <td className="px-4 py-3 text-xs font-normal text-muted-foreground">
                {missing > 0
                  ? `${missing} ${missing === 1 ? 'criterion' : 'criteria'} had no data`
                  : null}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
