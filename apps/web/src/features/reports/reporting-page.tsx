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
    const projectSummaries = await pathwaysClient.getProjects()
    const projects = await Promise.all(
      projectSummaries.map((project) => pathwaysClient.getProject(project.id)),
    )
    const indicatorGroups = await Promise.all(
      projects.map((project) => pathwaysClient.getProjectIndicators(project.id)),
    )

    return (
      <ReportingWorkspace
        activities={[]}
        indicators={indicatorGroups.flat()}
        initialKind={initialKind}
        journeyStages={[]}
        previewOnly={previewOnly}
        projects={projects}
        reports={[]}
        surveyForms={[]}
        surveyResults={[]}
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
