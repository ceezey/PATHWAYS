import type { Metadata } from 'next'

import { AlertsWorkspace } from '@/features/analytics/alerts-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Alert Review' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('alerts', props)
  const { alert } = (await props.searchParams) ?? {}

  return <AlertsWorkspace initialAlertId={typeof alert === 'string' ? alert : undefined} />
}
