'use client'

import { BarChart3 } from 'lucide-react'

import { EmptyState } from '@/components/pathways/empty-state'

export const ChartPanel = ({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) => (
  <section className="overflow-hidden rounded-2xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
)

/** Capability gaps keep "Data unavailable"; genuinely empty selections pass "None yet". */
export const UnavailableChart = ({
  description,
  title = 'Data unavailable',
}: {
  description: string
  title?: string
}) => <EmptyState description={description} icon={BarChart3} title={title} />
