import type { AlertSeverity, RoleOverview } from '@pathways/shared'

type ProjectStatus = RoleOverview['projects'][number]['status']
type Health = {
  label: 'Critical' | 'At risk' | 'On track' | 'Planned'
  tone: 'danger' | 'warning' | 'success' | 'neutral'
}

/** Project health comes only from open rule-based alerts, never from a success score. */
export const healthOf = (
  status: ProjectStatus,
  alert: { open: number; maxSeverity: AlertSeverity } | undefined,
): Health => {
  if (status === 'PLANNED') return { label: 'Planned', tone: 'neutral' }
  if (alert?.maxSeverity === 'CRITICAL') return { label: 'Critical', tone: 'danger' }
  if (alert?.maxSeverity === 'HIGH' || alert?.maxSeverity === 'MEDIUM')
    return { label: 'At risk', tone: 'warning' }
  return { label: 'On track', tone: 'success' }
}

/** Time-of-day greeting with the first name, in the business time zone. */
export const greeting = (now: Date, fullName?: string | null) => {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Manila',
    }).format(now),
  )
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = fullName?.trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}.` : `Good ${part}.`
}
