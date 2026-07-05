import { AlertTriangle, BarChart3, FolderKanban } from 'lucide-react'

import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, MetricCard, SectionCard } from '@/components/pathways'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function AnalyticsPage() {
  const [projects, alerts] = await Promise.all([
    pathwaysClient.getProjects(),
    pathwaysClient.getAlerts(),
  ])
  const activeProjects = projects.filter((project) => project.status === 'Active').length

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="SADDD Analysis and Rule-Based Decision Support"
        description="Project filters, reporting periods, KPI cards, charts, alerts, and human-reviewed recommendation flows are scheduled for Phase 8."
      />
      <ModulePlaceholder
        title="Analytics foundation"
        summary="This placeholder confirms the analytics route and mock service are available before ECharts dashboards and rule workflows are implemented."
      >
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            description="Active mock projects available for later filtering."
            icon={FolderKanban}
            label="Active projects"
            tone="success"
            value={activeProjects.toString().padStart(2, '0')}
          />
          <MetricCard
            description="Rule-Based Alerts available for future review flows."
            icon={AlertTriangle}
            label="Alerts"
            tone="warning"
            value={alerts.length.toString().padStart(2, '0')}
          />
          <MetricCard
            description="Chart panels will be connected in Phase 8."
            icon={BarChart3}
            label="Chart modules"
            value="06"
          />
        </section>
        <SectionCard
          className="mt-4"
          title="Analytics chart placeholder"
          description="Recommendations are generated from predefined rules and require human review."
        >
          <EmptyState
            description="Filters, SADDD charts, trend charts, and alert lifecycle views will be added in Phase 8."
            icon={BarChart3}
            title="GUI implementation scheduled in a later phase"
          />
        </SectionCard>
      </ModulePlaceholder>
    </>
  )
}
