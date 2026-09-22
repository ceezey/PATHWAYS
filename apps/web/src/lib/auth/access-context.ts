import type { PathwaysRole } from '@/types/pathways-role'

export const getAccessScopeLabel = (
  role: PathwaysRole | null,
  assignedProjectIds: readonly string[],
) => {
  if (!role) return 'Scope pending verification'
  if (role === 'System Administrator') return 'Organization-wide'
  if (role === 'Program Manager' || role === 'Grant Manager') return 'Portfolio'
  const count = assignedProjectIds.length
  return `${count} assigned ${count === 1 ? 'project' : 'projects'}`
}
