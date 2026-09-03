import type { Metadata } from 'next'

import { AlertsWorkspace } from '@/features/analytics/alerts-workspace'

export const metadata: Metadata = { title: 'Alert Review' }

export default function AlertsPage() {
  return <AlertsWorkspace />
}
