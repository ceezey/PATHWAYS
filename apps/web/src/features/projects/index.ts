// Public surface of the projects feature for files outside it.
export { ProjectDetailView } from './components/project-detail-view'
export { ProjectDirectory } from './components/project-directory'
export { ProjectReviewWorkspace } from './components/project-review-workspace'
export { ProjectSetupForm } from './components/project-setup-form'
export { ProjectWorkspaceFrame } from './components/project-workspace-frame'
export { useProjectOverviewMetricsRead } from './projects.reads'
export { metricUnavailableLabel, overviewMetricLabel } from './projects.utils'
export { ActivityDetailPage } from './activities/components/activity-detail-page'
export { ActivityDetailPanel } from './activities/components/activity-detail-panel'
export { ActivityProofDialog } from './activities/components/activity-proof-dialog'
export { ProjectActivitiesWorkspace } from './activities/components/project-activities-workspace'

// Exported for files outside the feature until the slices that own them move them.
export { PrintReceiptPage } from './budget-module/print/print-receipt-page'
export { IndicatorLibraryManager } from './indicator-library-manager'
export { ProjectIndicatorsWorkspace } from './project-indicators-workspace'
