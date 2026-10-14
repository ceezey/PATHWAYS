'use client'

import { AlertTriangle, ClipboardCheck, Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, MetricCard, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { ADMIN_DASHBOARD_MONITORING_UI_ENABLED } from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { dashboardsClient } from '@/lib/api/dashboards'
import { can } from '@/lib/rbac/can'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { DashboardAction, RoleDashboardViewModel } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import type { RoutePrincipal } from '@pathways/shared'

import {
  type DashboardActivityTarget,
  actionWorkflowHref,
  dashboardActivityTarget,
  metricIcons,
  severityTone,
} from '../dashboard.utils'
import { RoleOverviewDashboard } from '../role-overview/role-overview'
import { ActionKpiRow } from './action-kpi-row'
import { ConnectedMonitoringSnapshot } from './connected-monitoring-snapshot'
import { DashboardActivityReviewPanel } from './dashboard-activity-review-panel'
import { ActionButton, DashboardListItem } from './dashboard-list-item'
import { ExecutiveDashboard } from './executive-dashboard'

export const canLoadDashboardMonitoring = (
  role: PathwaysRole | null,
  profile: RoutePrincipal | null,
) =>
  Boolean(
    role &&
      can(role, 'monitor_evaluate.view') &&
      can(role, 'analytics.view') &&
      principalHasAtomicPermission(profile, 'monitoring.read') &&
      principalHasAtomicPermission(profile, 'analytics.read'),
  )

export const RoleDashboard = () => {
  const router = useRouter()
  const { role, profile } = useCurrentRole()
  const roleLabel = role || 'Staff'
  const [dashboard, setDashboard] = useState<RoleDashboardViewModel | null>(null)
  const [activityReviewTarget, setActivityReviewTarget] = useState<DashboardActivityTarget | null>(
    null,
  )
  const activityReviewTrigger = useRef<HTMLElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [dashboardRevision, setDashboardRevision] = useState(0)

  useEffect(() => {
    void dashboardRevision
    let mounted = true
    setStatus('loading')

    if (role !== 'System Administrator') return
    dashboardsClient
      .getDashboard(role)
      .then((viewModel) => {
        if (!mounted) {
          return
        }

        setDashboard(viewModel)
        setStatus('success')
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setStatus('error')
      })

    return () => {
      mounted = false
    }
  }, [dashboardRevision, role])

  const handleAction = (action: DashboardAction) => {
    if (
      action.id === 'review-proof' ||
      action.id === 'review-expense' ||
      action.id === 'open-activity-update' ||
      action.id === 'view-orientation-summary'
    ) {
      const target = dashboardActivityTarget(action.href)
      if (target) {
        activityReviewTrigger.current = document.activeElement as HTMLElement | null
        setActivityReviewTarget(target)
        return
      }
    }

    if (action.kind === 'navigate' && action.href) {
      router.push(action.href)
      return
    }
    router.push(actionWorkflowHref(action))
  }

  if (role && role !== 'System Administrator')
    return <RoleOverviewDashboard fullName={profile?.fullName} role={role} />

  if (status === 'loading') {
    return (
      <>
        <h1 className="sr-only">Dashboard</h1>
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading dashboard...
          </div>
        </div>
      </>
    )
  }

  if (status === 'error' || !dashboard) {
    return (
      <>
        <h1 className="sr-only">Dashboard unavailable</h1>
        <EmptyState
          className="min-h-[360px] rounded-2xl border border-border bg-card"
          description="We could not load this dashboard right now. Reload the page to try again."
          icon={AlertTriangle}
          title="Dashboard data unavailable"
        />
      </>
    )
  }

  const emptyDashboard =
    dashboard.metrics.length === 0 &&
    dashboard.sections.every((section) => section.items.length === 0)

  return (
    <>
      <PageHeader title={`Welcome! ${roleLabel}`} />
      {ADMIN_DASHBOARD_MONITORING_UI_ENABLED ? <ActionKpiRow /> : null}
      {ADMIN_DASHBOARD_MONITORING_UI_ENABLED && canLoadDashboardMonitoring(role, profile) ? (
        <ConnectedMonitoringSnapshot
          action={
            !dashboard.executive && dashboard.primaryAction ? (
              <ActionButton
                action={dashboard.primaryAction}
                onAction={handleAction}
                variant="default"
              />
            ) : undefined
          }
          role={role}
        />
      ) : null}
      {dashboard.executive ? (
        <ExecutiveDashboard model={dashboard.executive} summaryAction={dashboard.primaryAction} />
      ) : null}
      {emptyDashboard ? (
        <EmptyState
          className="min-h-[260px] rounded-2xl border border-border bg-card"
          description="No dashboard records are available for this account."
          icon={ShieldCheck}
          title="No dashboard records"
        />
      ) : null}
      {dashboard.metrics.length > 0 && role && !can(role, 'monitor_evaluate.view') ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.metrics.map((metric, index) => {
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
        </section>
      ) : null}
      {dashboard.sections.length > 0 ? (
        <section className="space-y-4" aria-labelledby="operational-detail-title">
          {dashboard.executive ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Operational detail
              </p>
              <h2
                className="font-heading text-2xl font-normal leading-8 tracking-normal text-foreground"
                id="operational-detail-title"
              >
                Projects and alerts behind the summary
              </h2>
              <p className="text-base leading-6 text-muted-foreground">
                Portfolio-wide records remain available for follow-up after the executive review.
              </p>
            </div>
          ) : (
            <h2 className="sr-only" id="operational-detail-title">
              Dashboard detail
            </h2>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {dashboard.sections.map((section) => (
              <SectionCard
                key={section.id}
                title={section.title}
                description={section.description}
                actions={
                  section.viewAllHref ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={section.viewAllHref}>{section.viewAllLabel ?? 'View All'}</Link>
                    </Button>
                  ) : null
                }
              >
                {section.items.length > 0 ? (
                  <div
                    aria-label={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? `${section.title} list`
                        : undefined
                    }
                    className={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? 'max-h-[19rem] overflow-y-auto pr-2'
                        : undefined
                    }
                    data-visible-entry-limit={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? '3'
                        : undefined
                    }
                    tabIndex={
                      section.id === 'portfolio-health' || section.id === 'escalated-alerts'
                        ? 0
                        : undefined
                    }
                  >
                    {section.items.map((item) => (
                      <DashboardListItem
                        compact={section.id === 'portfolio-health'}
                        key={item.id}
                        item={item}
                        onAction={handleAction}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    description={section.emptyText ?? 'No records are currently available.'}
                    icon={ClipboardCheck}
                    title="Nothing to review"
                  />
                )}
              </SectionCard>
            ))}
          </div>
        </section>
      ) : null}
      <DashboardActivityReviewPanel
        onActivityChanged={() => setDashboardRevision((revision) => revision + 1)}
        onClose={() => {
          setActivityReviewTarget(null)
          window.requestAnimationFrame(() => activityReviewTrigger.current?.focus())
        }}
        role={role}
        target={activityReviewTarget}
      />
    </>
  )
}
