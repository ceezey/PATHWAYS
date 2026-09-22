import type { Metadata } from 'next'

import { OwnProfileWorkspace } from '@/features/profile/own-profile-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'My Profile' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('settings', props)
  return <OwnProfileWorkspace />
}
