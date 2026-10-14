'use client'

export const SummaryMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-surface-subtle p-3">
    <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
  </div>
)
