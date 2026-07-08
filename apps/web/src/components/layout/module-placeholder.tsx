import type { ReactNode } from 'react'

import { StatusBadge } from '@/components/pathways/status-badge'

export const ModulePlaceholder = ({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children?: ReactNode
}) => (
  <section className="space-y-4">
    <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{summary}</p>
      </div>
      <StatusBadge tone="info">GUI implementation scheduled in a later phase</StatusBadge>
    </div>
    {children ? <div>{children}</div> : null}
  </section>
)
