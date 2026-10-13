'use client'

import type { Camera } from 'lucide-react'

export const MediaKpi = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera
  label: string
  value: number
}) => (
  <article className="flex items-start justify-between gap-3 bg-card p-4 sm:p-5">
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
    <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary-subtle text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  </article>
)
