import { FileWarning } from 'lucide-react'

import { EmptyState } from '@/components/pathways/empty-state'
import { ReportingWorkspace } from '@/features/reports/reporting-workspace'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ReportKind } from '@/types/pathways'

type ReportingPageProps = {
  initialKind: ReportKind
  previewOnly?: boolean
}

export const ReportingPage = async ({ initialKind, previewOnly = false }: ReportingPageProps) => {
  try {
    // TODO(RBAC): Restrict internal reports by role and project access.
    const projectSummaries = await pathwaysClient.getProjects()
    const projects = await Promise.all(
      projectSummaries.map((project) => pathwaysClient.getProject(project.id)),
    )
    const [indicatorGroups, reports, surveyForms, surveyResults] = await Promise.all([
      Promise.all(projects.map((project) => pathwaysClient.getProjectIndicators(project.id))),
      pathwaysClient.getReports(),
      pathwaysClient.getSurveyForms(),
      pathwaysClient.getSurveyAggregateResults(),
    ])
    const surveyProjectIds = [...new Set(surveyForms.map((form) => form.projectId))]
    const [activityGroups, journeyStageGroups] = await Promise.all([
      Promise.all(surveyProjectIds.map((projectId) => pathwaysClient.getActivities(projectId))),
      Promise.all(surveyProjectIds.map((projectId) => pathwaysClient.getJourneyStages(projectId))),
    ])

    return (
      <ReportingWorkspace
        activities={activityGroups.flat()}
        indicators={indicatorGroups.flat()}
        initialKind={initialKind}
        journeyStages={journeyStageGroups.flat()}
        previewOnly={previewOnly}
        projects={projects}
        reports={reports}
        surveyForms={surveyForms}
        surveyResults={surveyResults}
      />
    )
  } catch {
    return (
      <EmptyState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="Report data could not be loaded. The reporting backend may not be configured yet."
        icon={FileWarning}
        title="Reports unavailable"
      />
    )
  }
}
