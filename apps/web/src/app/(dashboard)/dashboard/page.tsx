import type { Metadata } from 'next'

import { RoleDashboard } from '@/features/dashboard/role-dashboard'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Staff Dashboard' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('dashboard', props)
  return <RoleDashboard />
}
