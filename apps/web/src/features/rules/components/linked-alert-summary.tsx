'use client'

import { StatusBadge } from '@/components/pathways'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { rulesHumanClient } from '@/lib/api/rules'
import Link from 'next/link'
import { statusLabel } from '../rules.copy'
import { severityTone, titleCase } from '../rules.utils'
import { basisLine } from '../rules.utils'

/** Names the alert a recommendation came from, with its severity, status and measured value. */
export function LinkedAlertSummary({ alertId, projectId }: { alertId: string; projectId: string }) {
  const linked = useAuthorizedRead(
    `recommendation-linked-alert:${alertId}`,
    projectId,
    'alerts.read',
    (signal) => rulesHumanClient.getAlert(alertId, signal),
    true,
    { freshness: 'summary' },
  )
  const alert = linked.data
  const href = `/alerts?alert=${alertId}`
  if (!alert)
    return (
      <Link className="text-primary underline" href={href}>
        {linked.isError ? 'View linked alert' : 'Loading linked alert'}
      </Link>
    )
  const measured = basisLine(alert)
  return (
    <div className="space-y-2 rounded-md border border-danger/30 bg-danger-subtle p-3">
      <p className="text-sm text-muted-foreground">Linked alert</p>
      <Link className="block font-semibold text-primary underline" href={href}>
        {alert.title}
      </Link>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={severityTone(alert.severity)}>{titleCase(alert.severity)}</StatusBadge>
        <StatusBadge tone="neutral">{statusLabel(alert.lifecycle)}</StatusBadge>
      </div>
      <p className="whitespace-pre-wrap text-sm">{alert.explanation}</p>
      {measured ? <p className="text-sm text-muted-foreground">{measured}</p> : null}
    </div>
  )
}
