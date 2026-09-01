'use client'

import { AlertTriangle, ArrowRight, Gauge, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ProgressBar, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type {
  DashboardAction,
  DashboardSeverity,
  ExecutiveDashboardContext,
  ExecutiveDashboardViewModel,
} from '@/types/pathways'

const statusTone = (status: ExecutiveDashboardContext['deliveryStatus']) => {
  if (status === 'On Track') {
    return 'success'
  }

  if (status === 'Behind Schedule') {
    return 'danger'
  }

  return 'warning'
}

const riskToneClasses: Record<DashboardSeverity, string> = {
  neutral: 'border-border bg-muted/40 text-foreground',
  info: 'border-info/20 bg-info/10 text-info',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/20 bg-danger/10 text-danger',
}

export const ExecutiveDashboard = ({
  model,
  summaryAction,
}: {
  model: ExecutiveDashboardViewModel
  summaryAction?: DashboardAction
}) => {
  const [selectedContextId, setSelectedContextId] = useState(model.defaultContextId)
  const context = model.contexts.find((item) => item.id === selectedContextId) ?? model.contexts[0]
  const portfolioAction =
    summaryAction?.kind === 'navigate' && summaryAction.href
      ? { href: summaryAction.href, label: summaryAction.label }
      : undefined

  if (!context) {
    return null
  }

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="executive-summary-title"
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      >
        <div className="border-b border-border bg-muted/30 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Executive summary
                </p>
                <StatusBadge tone={statusTone(context.deliveryStatus)}>
                  {context.deliveryStatus}
                </StatusBadge>
              </div>
              <h2
                className="text-2xl font-semibold tracking-tight text-foreground"
                id="executive-summary-title"
              >
                {context.title}
              </h2>
              <p className="text-sm font-medium text-muted-foreground">{context.scopeLabel}</p>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {context.deliverySummary}
              </p>
            </div>

            <div className="w-full space-y-4 lg:w-72">
              <div className="space-y-2">
                <Label htmlFor="executive-project-context">Project context</Label>
                <Select value={context.id} onValueChange={setSelectedContextId}>
                  <SelectTrigger id="executive-project-context" aria-label="Project context">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {model.contexts.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.selectorLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  Compare the portfolio with active project snapshots.
                </p>
              </div>

              {portfolioAction ? (
                <Button asChild className="w-full justify-between">
                  <Link href={portfolioAction.href}>
                    {portfolioAction.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2">
          <ExecutiveSignal
            icon={Gauge}
            label="Delivery outlook"
            value={context.deliveryStatus}
            helperText="Whether delivery is on track for the selected context"
            tone={statusTone(context.deliveryStatus)}
          />
          <ExecutiveSignal
            icon={Target}
            label="Goal outlook"
            value={context.goalOutlook}
            helperText={`${context.goalAchievement}% of the outcome target achieved`}
            progress={context.goalAchievement}
            tone={statusTone(context.deliveryStatus)}
          />
        </div>
      </section>

      <section
        className={cn(
          'flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between',
          riskToneClasses[context.riskSeverity],
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">{context.riskLabel}</h2>
            <p className="mt-1 text-sm leading-6 opacity-90">{context.riskSummary}</p>
          </div>
        </div>
        {context.projectId ? (
          <Button asChild className="shrink-0" size="sm" variant="outline">
            <Link href={`/projects/${context.projectId}`}>
              Open project
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </section>
    </div>
  )
}

const ExecutiveSignal = ({
  icon: Icon,
  label,
  value,
  helperText,
  progress,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  helperText: string
  progress?: number
  tone: 'info' | 'success' | 'warning' | 'danger'
}) => (
  <article className="min-w-0 bg-card p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 break-words text-xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
      </div>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'info' && 'bg-info/10 text-info',
          tone === 'success' && 'bg-success/10 text-success',
          tone === 'warning' && 'bg-warning/20 text-warning',
          tone === 'danger' && 'bg-danger/10 text-danger',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
    </div>
    <p className="mt-2 text-sm leading-5 text-muted-foreground">{helperText}</p>
    {typeof progress === 'number' ? (
      <div className="mt-4">
        <ProgressBar label={label} tone={tone} value={progress} />
      </div>
    ) : null}
  </article>
)
