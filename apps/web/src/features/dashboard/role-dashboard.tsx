'use client'

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FolderKanban,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import {
  DialogShell,
  EmptyState,
  MetricCard,
  ProgressBar,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { webSetupState } from '@/lib/env'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  DashboardAction,
  DashboardItem,
  DashboardSeverity,
  RoleDashboardViewModel,
} from '@/types/pathways'

const severityTone = (severity?: DashboardSeverity) => {
  if (severity === 'danger') {
    return 'danger'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  if (severity === 'success') {
    return 'success'
  }

  return 'info'
}

const statusTone = (severity?: DashboardSeverity) =>
  severity === 'neutral' ? 'neutral' : severityTone(severity)

const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]

const ActionButton = ({
  action,
  onAction,
  variant = 'outline',
}: {
  action: DashboardAction
  onAction: (action: DashboardAction) => void
  variant?: 'default' | 'outline' | 'secondary'
}) => (
  <Button
    className="gap-2"
    onClick={() => onAction(action)}
    size="sm"
    type="button"
    variant={variant}
  >
    {action.label}
    {action.kind === 'navigate' ? <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
  </Button>
)

const DashboardListItem = ({
  item,
  onAction,
}: {
  item: DashboardItem
  onAction: (action: DashboardAction) => void
}) => (
  <div className="rounded-lg border border-border bg-background p-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-1">
        {item.href ? (
          <Link
            className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
            href={item.href}
          >
            <span className="truncate">{item.title}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        )}
        <p className="text-sm leading-5 text-muted-foreground">{item.description}</p>
        {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
      </div>
      {item.status ? (
        <StatusBadge tone={statusTone(item.severity)}>{item.status}</StatusBadge>
      ) : null}
    </div>
    {typeof item.progress === 'number' ? (
      <div className="mt-4">
        <ProgressBar label="Progress" tone={severityTone(item.severity)} value={item.progress} />
      </div>
    ) : null}
    {item.primaryAction || item.secondaryAction ? (
      <div className="mt-4 flex flex-wrap gap-2">
        {item.primaryAction ? (
          <ActionButton action={item.primaryAction} onAction={onAction} variant="default" />
        ) : null}
        {item.secondaryAction ? (
          <ActionButton action={item.secondaryAction} onAction={onAction} />
        ) : null}
      </div>
    ) : null}
  </div>
)

export const RoleDashboard = () => {
  const router = useRouter()
  const { role } = usePrototypeRole()
  const [dashboard, setDashboard] = useState<RoleDashboardViewModel | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [activeAction, setActiveAction] = useState<DashboardAction | null>(null)

  useEffect(() => {
    let mounted = true
    setStatus('loading')

    pathwaysClient
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
  }, [role])

  const handleAction = (action: DashboardAction) => {
    if (action.kind === 'navigate' && action.href) {
      router.push(action.href)
      return
    }

    if (action.kind === 'toast') {
      toast.info(action.toastTitle ?? 'Prototype action', {
        description:
          action.toastDescription ??
          'This action is available as a frontend prototype and is not persisted.',
      })
      return
    }

    setActiveAction(action)
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading role-specific dashboard...
        </div>
      </div>
    )
  }

  if (status === 'error' || !dashboard) {
    return (
      <EmptyState
        className="min-h-[360px] rounded-lg border border-border bg-card"
        description="The dashboard service could not load the role-specific prototype data."
        icon={AlertTriangle}
        title="Dashboard data unavailable"
      />
    )
  }

  const emptyDashboard =
    dashboard.metrics.length === 0 &&
    dashboard.sections.every((section) => section.items.length === 0)

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={dashboard.heading}
        description={dashboard.summary}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={webSetupState.guiPrototypeModeEnabled ? 'info' : 'neutral'}>
              {webSetupState.guiPrototypeModeEnabled ? 'Prototype mode' : 'Supabase mode'}
            </StatusBadge>
            <StatusBadge tone="neutral">{role}</StatusBadge>
          </div>
        }
      />
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {dashboard.greetingName}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Prototype Role Preview controls this content and does not provide authorization.
            </p>
          </div>
          {dashboard.primaryAction ? (
            <ActionButton
              action={dashboard.primaryAction}
              onAction={handleAction}
              variant="default"
            />
          ) : null}
        </div>
      </section>
      {emptyDashboard ? (
        <EmptyState
          className="min-h-[260px] rounded-lg border border-border bg-card"
          description="Switch to a supported prototype role to load dashboard data."
          icon={ShieldCheck}
          title="No dashboard records"
        />
      ) : null}
      {dashboard.metrics.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.metrics.map((metric, index) => {
            const Icon = metricIcons[index % metricIcons.length]

            return (
              <MetricCard
                key={metric.id}
                description={metric.helperText}
                icon={Icon}
                label={metric.label}
                tone={severityTone(metric.severity)}
                value={String(metric.value)}
              />
            )
          })}
        </section>
      ) : null}
      <section className="grid gap-4 xl:grid-cols-2">
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
              <div className="space-y-3">
                {section.items.map((item) => (
                  <DashboardListItem key={item.id} item={item} onAction={handleAction} />
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
      </section>
      <Dialog open={Boolean(activeAction)} onOpenChange={(open) => !open && setActiveAction(null)}>
        {activeAction ? (
          <DialogShell
            title={activeAction.dialogTitle ?? activeAction.label}
            description={
              activeAction.dialogDescription ??
              'This prototype action is functional as a dialog and does not persist changes.'
            }
          >
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                This is a frontend-only prototype interaction. Production data, permission checks,
                notifications, and audit logs are not updated.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setActiveAction(null)} type="button">
                  Close
                </Button>
              </div>
            </div>
          </DialogShell>
        ) : null}
      </Dialog>
    </>
  )
}
