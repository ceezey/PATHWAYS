import { StatusBadge } from '@/components/pathways'
import type { HumanAlert } from '@pathways/shared'
import { severityText, severityTone } from '../rules.utils'

/** Alert level as text plus colour: Needs context, the manual Critical mark, or the suggested level. */
export function AlertSeverityBadge({
  severity,
  basis,
}: {
  severity: HumanAlert['severity']
  basis: HumanAlert['severityBasis']
}) {
  const manual = severity !== null && basis?.manualCritical
  return (
    <StatusBadge tone={severityTone(severity)}>
      {manual ? 'Critical: manual judgment by rule author' : severityText(severity)}
    </StatusBadge>
  )
}
