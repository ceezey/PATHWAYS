import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { UserManagementWorkspace } from '@/features/settings/user-management-workspace'
import { pathwaysClient } from '@/lib/services/pathways-client'

async function UserManagementPage() {
  const [users, projects] = await Promise.all([
    pathwaysClient.getUsers(),
    pathwaysClient.getProjects(),
  ])

  return <UserManagementWorkspace initialProjects={projects} initialUsers={users} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('users', props)
  return UserManagementPage()
}
