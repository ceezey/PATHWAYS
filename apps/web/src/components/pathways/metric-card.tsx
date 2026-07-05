import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const MetricCard = ({
  label,
  value,
  description,
  icon: Icon,
  tone = 'info',
}: {
  label: string
  value: string
  description: string
  icon?: LucideIcon
  tone?: 'info' | 'success' | 'warning' | 'danger'
}) => (
  <Card className="rounded-lg">
    <CardContent className="flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {Icon ? (
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tone === 'info' && 'bg-info/10 text-info',
            tone === 'success' && 'bg-success/10 text-success',
            tone === 'warning' && 'bg-warning/20 text-warning',
            tone === 'danger' && 'bg-danger/10 text-danger',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      ) : null}
    </CardContent>
  </Card>
)
