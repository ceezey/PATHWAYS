import { UserManagementWorkspace } from '@/features/settings/user-management-workspace'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function UserManagementPage() {
  const users = await pathwaysClient.getUsers()

  return <UserManagementWorkspace initialUsers={users} />
}
