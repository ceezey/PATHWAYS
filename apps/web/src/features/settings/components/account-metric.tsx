import type { UsersRound } from 'lucide-react'

export const AccountMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound
  label: string
  value: number
}) => (
  <div className="flex items-center justify-between gap-4 bg-card p-4 sm:p-5">
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
    <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary-subtle text-primary">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  </div>
)
