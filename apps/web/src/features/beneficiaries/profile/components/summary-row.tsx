'use client'

export const SummaryRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-lg border border-border bg-surface-subtle p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Not recorded'}</p>
  </div>
)
