import { ReportingWorkspace } from '@/features/reports/reporting-workspace'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { ReportKind } from '@/types/pathways'

type ReportingPageProps = {
  initialKind: ReportKind
  previewOnly?: boolean
}

export const ReportingPage = async ({ initialKind, previewOnly = false }: ReportingPageProps) => {
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
}
