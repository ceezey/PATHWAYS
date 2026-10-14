'use client'

import { cn } from '@/lib/utils'

export const SummaryPill = ({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'success' | 'warning' | 'neutral' | 'danger'
  value: number
}) => (
  <div className="rounded-sm border bg-surface-subtle p-2">
    <p className="text-muted-foreground">{label}</p>
    <p
      className={cn(
        'mt-1 text-lg font-semibold',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'neutral' && 'text-muted-foreground',
        tone === 'danger' && 'text-danger',
      )}
    >
      {value}
    </p>
  </div>
)
