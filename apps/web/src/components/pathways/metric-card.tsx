import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { MetricTooltip } from './metric-tooltip'

export const MetricCard = ({
  label,
  value,
  description,
  icon: Icon,
  tone = 'info',
  href,
}: {
  label: string
  value: string
  description: string
  icon?: LucideIcon
  tone?: 'info' | 'success' | 'warning' | 'danger'
  href?: string
}) => (
  <Card className="relative">
    {href ? (
      <Link
        aria-label={`View ${label}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={href}
      >
        <span className="sr-only">View {label}</span>
      </Link>
    ) : null}
    <CardContent className="pointer-events-none relative flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <MetricTooltip label={label}>{description}</MetricTooltip>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      </div>
      {Icon ? (
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm',
            tone === 'info' && 'bg-info-subtle text-info',
            tone === 'success' && 'bg-success-subtle text-success',
            tone === 'warning' && 'bg-warning-subtle text-warning',
            tone === 'danger' && 'bg-danger-subtle text-danger',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}
    </CardContent>
  </Card>
)
