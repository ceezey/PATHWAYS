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
  const [indicatorGroups, beneficiaries, reports] = await Promise.all([
    Promise.all(projects.map((project) => pathwaysClient.getProjectIndicators(project.id))),
    pathwaysClient.getBeneficiaryRecords(),
    pathwaysClient.getReports(),
  ])

  return (
    <ReportingWorkspace
      beneficiaries={beneficiaries}
      indicators={indicatorGroups.flat()}
      initialKind={initialKind}
      previewOnly={previewOnly}
      projects={projects}
      reports={reports}
    />
  )
}
