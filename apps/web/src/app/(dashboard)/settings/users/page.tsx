import { UserManagementWorkspace } from '@/features/settings/user-management-workspace'
import { pathwaysClient } from '@/lib/services/pathways-client'

export default async function UserManagementPage() {
  const [users, projects] = await Promise.all([
    pathwaysClient.getUsers(),
    pathwaysClient.getProjects(),
  ])

  return <UserManagementWorkspace initialProjects={projects} initialUsers={users} />
}
