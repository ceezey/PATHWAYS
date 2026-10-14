import type { MonitoringDashboard } from '@pathways/shared'

/** Parses a released metric cell into a finite number, or null when it is not available. */
export const metricNumber = (cell: { value: string | null }) => {
  if (cell.value === null) return null
  const value = Number(cell.value)
  return Number.isFinite(value) ? value : null
}

/** Active indicators of one project, as shown in the KPI panel. */
export const activeIndicators = (monitoring: MonitoringDashboard, projectId: string) =>
  monitoring.indicators.filter((row) => row.projectId === projectId && row.status === 'ACTIVE')

/** Released indicator progress rows; indicators without a released value are left out. */
export const progressRows = (indicators: MonitoringDashboard['indicators']) =>
  indicators.flatMap((row) => {
    const value = metricNumber(row.progress)
    return value === null ? [] : [{ id: row.id, label: row.name, value }]
  })
