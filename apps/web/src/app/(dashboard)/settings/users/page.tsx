import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { UserManagementWorkspace } from '@/features/settings'
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('users', props)
  return <UserManagementWorkspace />
}
