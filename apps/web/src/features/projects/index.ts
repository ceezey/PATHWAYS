// Public surface of the projects feature for files outside it.
export { ProjectDetailView } from './components/project-detail-view'
export { ProjectDirectory } from './components/project-directory'
export { ProjectReviewWorkspace } from './components/project-review-workspace'
export { ProjectSetupForm } from './components/project-setup-form'
export { ProjectWorkspaceFrame } from './components/project-workspace-frame'
export {
  useProjectJourneyStagesRead,
  useProjectOverviewMetricsRead,
  useProjectRead,
} from './projects.reads'
export { metricUnavailableLabel, overviewMetricLabel } from './projects.utils'
export { useProjectActivitiesRead } from './activities/activities.reads'
export { ActivityDetailPage } from './activities/components/activity-detail-page'
export { ActivityDetailPanel } from './activities/components/activity-detail-panel'
export { ActivityProofDialog } from './activities/components/activity-proof-dialog'
export { ProjectActivitiesWorkspace } from './activities/components/project-activities-workspace'

// Exported for files outside the feature until the slices that own them move them.
export { PrintReceiptPage } from './budget/print/print-receipt-page'
export { IndicatorLibraryManager } from './indicators/components/indicator-library-manager'
export { ProjectIndicatorsWorkspace } from './indicators/components/project-indicators-workspace'
