'use client'

import { AlertTriangle, FolderKanban } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { EmptyState, MetricCard, SectionCard } from '@/components/pathways'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DASHBOARD_PINS_UI_ENABLED } from '@/constants/feature-flags'
import type { useCurrentRole } from '@/hooks/use-current-role'
import { dashboardsClient } from '@/lib/api/dashboards'
import { projectsClient } from '@/lib/api/projects'
import { can } from '@/lib/rbac/can'
import type { RoleDashboardViewModel } from '@/types/pathways'

import { metricIcons, severityTone, trailingYearPeriod } from '../dashboard.utils'
import { monitoringReachMetrics } from '../monitoring-reach-metrics.utils'
import { PinnedCharts } from './pinned-charts'

export const ConnectedMonitoringSnapshot = ({
  role,
  action,
}: {
  role: ReturnType<typeof useCurrentRole>['role']
  action?: ReactNode
}) => {
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [metrics, setMetrics] = useState<RoleDashboardViewModel['metrics']>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!role) return
    let active = true
    projectsClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active) return
        setProjects(records)
        const requested = new URLSearchParams(window.location.search).get('project')
        setProjectId((current) =>
          records.some((record) => record.id === current)
            ? current
            : (records.find((record) => record.id === requested)?.id ??
              (records.length ? 'all' : '')),
        )
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Project scope could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    if (!projectId) return
    let active = true
    setMetrics([])
    setError('')
    dashboardsClient
      .getMonitoringDashboard({
        ...(projectId === 'all' ? {} : { projectId }),
        ...trailingYearPeriod(),
      })
      .then((result) => {
        if (!active) return
        setMetrics(monitoringReachMetrics(result))
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Monitoring data could not be loaded.',
          )
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (!role || !can(role, 'monitor_evaluate.view')) return null
  return (
    <SectionCard title="Project monitoring">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xl space-y-1.5">
          <label className="text-sm font-medium" htmlFor="dashboard-project-scope">
            Project scope
          </label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="dashboard-project-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {error ? (
        <EmptyState
          className="rounded-xl border border-border bg-card"
          description={error}
          icon={AlertTriangle}
          title="Monitoring data unavailable"
        />
      ) : projects.length && metrics.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = metricIcons[index % metricIcons.length]
            return (
              <MetricCard
                description={metric.helperText}
                href={metric.href}
                icon={Icon}
                key={metric.id}
                label={metric.label}
                tone={severityTone(metric.severity)}
                value={String(metric.value)}
              />
            )
          })}
        </div>
      ) : projects.length ? (
        <p className="text-sm text-muted-foreground">Loading project monitoring data...</p>
      ) : (
        <EmptyState
          description="No projects are assigned to this account. Contact an administrator to review project access."
          icon={FolderKanban}
          title="No authorized projects"
        />
      )}
      {DASHBOARD_PINS_UI_ENABLED ? <PinnedCharts projects={projects} /> : null}
    </SectionCard>
  )
}
