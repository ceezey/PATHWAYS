import type { ProjectIndicator, ProjectSummary } from '@/types/pathways'

export interface AnalyticsReportingPeriod {
  value: string
  label: string
  start: string
  end: string
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const isIsoCalendarDate = (value: string | null | undefined): value is string => {
  if (!value || !isoDatePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

const dateParts = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day, date: new Date(Date.UTC(year, month - 1, day)) }
}

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
})
const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export const formatAnalyticsReportingPeriod = (start: string, end: string) => {
  const first = dateParts(start)
  const last = dateParts(end)
  if (start === end) return fullDateFormatter.format(first.date)
  if (first.year === last.year && first.month === last.month) {
    return `${monthFormatter.format(first.date)} ${first.day}\u2013${last.day}, ${first.year}`
  }
  if (first.year === last.year) {
    return `${monthFormatter.format(first.date)} ${first.day} \u2013 ${monthFormatter.format(last.date)} ${last.day}, ${first.year}`
  }
  return `${fullDateFormatter.format(first.date)} \u2013 ${fullDateFormatter.format(last.date)}`
}

export const deriveAnalyticsReportingPeriods = (
  project: Pick<ProjectSummary, 'startDate' | 'endDate'> | undefined,
  indicators: Pick<ProjectIndicator, 'status' | 'periodStart' | 'periodEnd'>[],
): AnalyticsReportingPeriod[] => {
  const hasProjectBounds = Boolean(project?.startDate && project.endDate)
  if (
    hasProjectBounds &&
    (!isIsoCalendarDate(project?.startDate) || !isIsoCalendarDate(project?.endDate))
  ) {
    return []
  }

  const periods = new Map<string, AnalyticsReportingPeriod>()
  for (const indicator of indicators) {
    const { periodStart: start, periodEnd: end } = indicator
    if (
      indicator.status !== 'ACTIVE' ||
      !isIsoCalendarDate(start) ||
      !isIsoCalendarDate(end) ||
      start > end
    ) {
      continue
    }
    if (
      hasProjectBounds &&
      project?.startDate &&
      project.endDate &&
      (end < project.startDate || start > project.endDate)
    ) {
      continue
    }
    const value = `${start}::${end}`
    periods.set(value, {
      value,
      label: formatAnalyticsReportingPeriod(start, end),
      start,
      end,
    })
  }

  return [...periods.values()].sort(
    (left, right) => right.start.localeCompare(left.start) || right.end.localeCompare(left.end),
  )
}
