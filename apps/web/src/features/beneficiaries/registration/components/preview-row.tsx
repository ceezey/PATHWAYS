'use client'

export const PreviewRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-xl border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Pending'}</p>
  </div>
)
