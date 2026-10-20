'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { ProgressBar, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import type { DashboardAction, DashboardItem } from '@/types/pathways'

import { severityTone, statusTone } from '../dashboard.utils'

export const ActionButton = ({
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

export const DashboardListItem = ({
  item,
  onAction,
  compact = false,
}: {
  item: DashboardItem
  onAction: (action: DashboardAction) => void
  compact?: boolean
}) => (
  <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        {item.meta ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{item.meta}</p>
        ) : null}
      </div>
      {item.status ? (
        <StatusBadge tone={statusTone(item.severity)}>{item.status}</StatusBadge>
      ) : null}
    </div>
    {typeof item.progress === 'number' ? (
      <div className={compact ? 'mt-3 sm:max-w-[220px]' : 'mt-4'}>
        <ProgressBar
          label={compact ? undefined : 'Progress'}
          tone={severityTone(item.severity)}
          value={item.progress}
        />
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
