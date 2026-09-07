import { getAssignedProjectIds } from '@/lib/rbac/data-scope'
import type { PrototypeRole } from '@/types/prototype-role'

export const getAccessScopeLabel = (role: PrototypeRole, isPrototype: boolean) => {
  if (!isPrototype) return 'Scope requires server verification'
  if (role === 'System Administrator') return 'Organization-wide preview'
  if (role === 'Program Manager' || role === 'Grant Manager') return 'Portfolio preview'
  const count = getAssignedProjectIds(role).length
  return `${count} assigned ${count === 1 ? 'project' : 'projects'} · preview`
}
