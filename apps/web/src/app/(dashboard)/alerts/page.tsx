import type { Metadata } from 'next'

import { AlertsWorkspace } from '@/features/analytics/alerts-workspace'

export const metadata: Metadata = { title: 'Alert Review' }

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ alert?: string }>
}) {
  const { alert } = await searchParams

  return <AlertsWorkspace initialAlertId={alert} />
}
