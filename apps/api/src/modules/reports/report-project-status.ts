import type { MetricCell, MonitoringIndicator } from '@pathways/shared'

export type StatusLevel = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NOT_AVAILABLE'
export type Figure = {
  label: string
  state: string
  value: string | null
  reason: string | null
  detail: string
  percent: number | null
}
export type ProjectSections = {
  reportDate: string
  information: Record<
    'code' | 'title' | 'status' | 'sector' | 'area' | 'startDate' | 'endDate' | 'partners',
    string
  > & { manager: string | null }
  overview: Array<{ area: string; status: StatusLevel; comment: string }>
  keyFigures: Figure[]
  milestones?: Array<{
    title: string
    status: string
    targetDate: string | null
    completionDate: string | null
    overdue: boolean
  }>
  indicators?: Array<{
    code: string
    name: string
    baseline: string | null
    target: string | null
    current: string
    progress: string
  }>
  alerts?: Array<{ title: string; severity: string; explanation: string; evaluatedAt: string }>
}
type OverviewInput = {
  reportDate: string
  milestones: Array<{ targetDate: string | null; status: string }> | null
  timeline: number | null
  budget: number | null
  kpi: number | null
}
const DAY_MS = 86_400_000
const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const closed = new Set(['COMPLETED', 'CANCELLED'])
export const statusLabel: Record<StatusLevel, string> = {
  ON_TRACK: 'ON TRACK',
  AT_RISK: 'AT RISK',
  OFF_TRACK: 'OFF TRACK',
  NOT_AVAILABLE: 'NOT AVAILABLE',
}

/** Percent of a visible metric cell; suppressed, missing or absent cells give null, never zero. */
export const metricPercent = (cell: MetricCell | null) =>
  cell && (cell.state === 'AVAILABLE' || cell.state === 'ZERO') && cell.value !== null
    ? Number(cell.value)
    : null

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
export const isOverdue = (
  milestone: { targetDate: string | null; status: string },
  reportDate: string,
) =>
  milestone.targetDate !== null &&
  milestone.targetDate < reportDate &&
  !closed.has(milestone.status)

// Percents carry one decimal, so integer tenths keep every threshold comparison exact.
const tenths = (percent: number) => Math.round(percent * 10)
const row = (area: string, status: StatusLevel, comment: string) => ({ area, status, comment })
const na = (area: string, why: string) => row(area, 'NOT_AVAILABLE', why)

/** Applies the status rules stated in the report footer. */
export function overviewRows(input: OverviewInput) {
  const { reportDate, milestones, timeline, budget, kpi } = input
  const overdue = (milestones ?? []).filter((m) => isOverdue(m, reportDate))
  const worst = Math.max(
    0,
    ...overdue.map((m) => daysBetween(m.targetDate ?? reportDate, reportDate)),
  )
  const schedule = !milestones?.length
    ? na('Schedule', 'No milestone data is available.')
    : worst > 30
      ? row(
          'Schedule',
          'OFF_TRACK',
          `${overdue.length} milestone(s) overdue, the oldest by ${worst} days.`,
        )
      : overdue.length
        ? row('Schedule', 'AT_RISK', `${overdue.length} milestone(s) overdue.`)
        : row('Schedule', 'ON_TRACK', 'No overdue milestones.')
  let spend = na('Budget', 'Budget or timeline data is not available.')
  if (budget !== null && timeline !== null)
    spend =
      tenths(budget) > 1000
        ? row('Budget', 'OFF_TRACK', `Budget used is ${budget}% of the approved amount.`)
        : tenths(budget) - tenths(timeline) > 150
          ? row(
              'Budget',
              'AT_RISK',
              `Budget used (${budget}%) is ahead of the timeline (${timeline}%).`,
            )
          : row(
              'Budget',
              'ON_TRACK',
              `Budget used (${budget}%) is in line with the timeline (${timeline}%).`,
            )
  let results = na('Indicators', 'KPI or timeline data is not available.')
  if (kpi !== null && timeline !== null) {
    const gap = tenths(timeline) - tenths(kpi)
    const text = `KPI achievement (${kpi}%) against timeline (${timeline}%).`
    results = row('Indicators', gap > 250 ? 'OFF_TRACK' : gap > 100 ? 'AT_RISK' : 'ON_TRACK', text)
  }
  return [schedule, spend, results]
}

/** Alerts by highest severity first, capped at 10. */
export const topAlerts = <T extends { severity: string }>(alerts: T[]) =>
  [...alerts]
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
    .slice(0, 10)

const cellText = (cell: MetricCell, suffix = '') =>
  cell.state === 'SUPPRESSED'
    ? 'Fewer than 5'
    : cell.value === null
      ? 'Not available'
      : `${cell.value}${suffix}`
const figureText = (f: Figure) =>
  f.state === 'SUPPRESSED' ? 'Fewer than 5' : (f.value ?? 'Not available')

export const INDICATOR_CAP = 50
export const indicatorRows = (items: MonitoringIndicator[]) =>
  items.slice(0, INDICATOR_CAP).map((i) => ({
    code: i.code,
    name: i.name,
    baseline: i.baseline,
    target: i.target,
    current: cellText(i.current),
    progress: cellText(i.progress, '%'),
  }))

/** Free text is clipped so one long value cannot break the cell limit of any format. */
export const clip = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value

export const TIMELINE_LABEL = 'Timeline elapsed'

/** Sections without the calendar-dependent parts, so the same data hashes the same on any day. */
export const stableSections = (s: ProjectSections) => {
  const { reportDate: _date, overview: _overview, ...rest } = s
  return {
    ...rest,
    keyFigures: s.keyFigures.filter((f) => f.label !== TIMELINE_LABEL),
    milestones: s.milestones?.map(({ overdue: _overdue, ...m }) => m),
    alerts: s.alerts?.map(({ evaluatedAt: _evaluated, ...a }) => a),
  }
}

/** Flat Section/Item/Value/Detail copy so pdfkit, CSV and XLSX keep working. */
export function flattenSections(s: ProjectSections) {
  const rows: string[][] = []
  const info = s.information
  const infoPairs: Array<[string, string]> = [
    ['Code', info.code],
    ['Title', info.title],
    ['Status', info.status],
    ['Sector', info.sector],
    ['Area', info.area],
    ['Start date', info.startDate],
    ['End date', info.endDate],
    ['Program manager', info.manager ?? 'Not specified'],
    ['Implementing partners', info.partners],
  ]
  for (const [item, value] of infoPairs) rows.push(['Project information', item, value, ''])
  for (const o of s.overview) rows.push(['Overview', o.area, statusLabel[o.status], o.comment])
  for (const f of s.keyFigures ?? []) rows.push(['Key figures', f.label, figureText(f), f.detail])
  for (const m of s.milestones ?? [])
    rows.push([
      'Milestones',
      m.title,
      m.status,
      `Target ${m.targetDate ?? 'not set'}; completed ${m.completionDate ?? 'no'}${m.overdue ? '; overdue' : ''}`,
    ])
  for (const i of s.indicators ?? [])
    rows.push([
      'Indicators',
      `${i.code} ${i.name}`,
      i.current,
      `Baseline ${i.baseline ?? 'n/a'}; target ${i.target ?? 'n/a'}; progress ${i.progress}`,
    ])
  for (const a of s.alerts ?? []) rows.push(['Open alerts', a.title, a.severity, a.explanation])
  return { columns: ['Section', 'Item', 'Value', 'Detail'], rows }
}
