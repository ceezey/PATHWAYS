// Public surface of the analytics feature for files outside it.
export { AnalyticsDashboard } from './components/analytics-dashboard'
export { IndicatorProgressChart } from './components/analytics-charts'
export { InsightStatus, RestrictedInsight } from './components/insight-status'
export { ParticipationBreakdownPanel } from './components/participation-breakdown-panel'
export {
  type InsightsSelection,
  canReadInsight,
  useParticipationBreakdown,
} from './hooks/use-analytics-insights'
export { activeIndicators, progressRows } from './kpi-rows.utils'
