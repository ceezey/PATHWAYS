import type { Metadata } from 'next'

import { RoleDashboard } from '@/features/dashboard/role-dashboard'

export const metadata: Metadata = { title: 'Staff Dashboard' }

export default function DashboardHomePage() {
  return <RoleDashboard />
}
