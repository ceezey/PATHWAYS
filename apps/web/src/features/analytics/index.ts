// Public surface of the analytics feature for files outside it.
export { AnalyticsDashboard } from './components/analytics-dashboard'
export { IndicatorProgressChart } from './components/analytics-charts'
export { InsightStatus, RestrictedInsight } from './components/insight-status'
export { ParticipationBreakdownPanel } from './components/participation-breakdown-panel'
export { ProjectCoverageMapPanel } from './components/project-coverage-map-panel'
export {
  type InsightsSelection,
  canReadInsight,
  useParticipationBreakdown,
} from './hooks/use-analytics-insights'
export { activeIndicators, progressRows } from './kpi-rows.utils'
export { AnalyticsCoverageMap } from './components/analytics-coverage-map'
export { PlacePopupCard } from './components/place-popup-card'
export { SadddChart } from './components/analytics-charts'
export { ChartPanel, UnavailableChart } from './components/chart-panel'
export { toProjectMapFeatures } from './hooks/use-project-map'
