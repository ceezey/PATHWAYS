import { overviewMetricLabel } from '@/features/projects'
import type { ActivitySummary } from '@/types/pathways'
import type { MetricCell, SurveyAnalytics, SurveyGroup } from '@pathways/shared'

import { type SurveyErrorKind, activityFallbackLabel } from './analytics.copy'

export const businessDateInManila = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

/** 403 = role restriction and 400 = refused period are final; only network/5xx may be retried. */
export const surveyErrorKindFor = (caught: unknown): SurveyErrorKind => {
  const status =
    caught && typeof caught === 'object' && 'status' in caught
      ? (caught as { status?: unknown }).status
      : undefined
  return status === 403 ? 'restricted' : status === 400 ? 'period' : 'retry'
}

/**
 * A visible value (including a real zero) renders with its unit; MISSING/SUPPRESSED
 * get the shared readable copy. `kind` matches overviewMetricLabel's Overview
 * convention so a percent cell never displays as a bare, unit-less number.
 */
export const analyticsCellValue = (cell: MetricCell, kind: 'percent' | 'pp' | 'count' = 'count') =>
  overviewMetricLabel(cell, kind)

/**
 * Maps a per-activity survey group's activityId key to its human title from the
 * already-loaded project activities, instead of showing a raw UUID. Falls back to
 * a neutral label when the activity is not found (e.g. archived or deleted).
 */
export const surveyGroupRows = (
  data: SurveyAnalytics,
  activities: readonly ActivitySummary[],
): Array<SurveyGroup & { label: string }> => [
  { ...data.overall, label: 'All activities (cohort change)' },
  ...data.byActivity.map((group) => ({
    ...group,
    label: activities.find((activity) => activity.id === group.key)?.title ?? activityFallbackLabel,
  })),
]

export const formatShare = (share: string | null) =>
  share === null ? 'Withheld' : `${(Number(share) * 100).toFixed(1)}%`
