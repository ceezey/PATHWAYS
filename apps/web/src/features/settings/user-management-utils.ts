import { type ProjectAssignableRole, projectAssignableRoles } from '@/lib/rbac/access-matrix'
import { canCreateOrAuthorizeRole, getAccessProfile } from '@/lib/rbac/can'
import { canConfigureProjectAssignment } from '@/lib/rbac/data-scope'
import type { ProjectSummary, UserAccountStatus, UserRecord } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'

export type UserStatusFilter = 'All' | UserAccountStatus

export interface PrototypeRoleSummary {
  role: PrototypeRole
  description: string
}

export const prototypeRoleSummaries: PrototypeRoleSummary[] = [
  {
    role: 'Program Manager',
    description: 'Executive portfolio review, progress signals, and goal-achievement oversight.',
  },
  {
    role: 'Grant Manager',
    description:
      'High-level grant and portfolio oversight using aggregate information without account authority.',
  },
  {
    role: 'Project Manager',
    description: 'Project delivery, approvals, activities, budgets, and monitoring workflows.',
  },
  {
    role: 'Monitoring and Evaluation Officer',
    description: 'Evidence review, SADDD Analysis, indicators, and evaluation follow-up.',
  },
  {
    role: 'Project Officer',
    description: 'Assigned project activities, Beneficiary records, proof, and field updates.',
  },
  {
    role: 'System Administrator',
    description: 'Prototype configuration, user records, labels, and future integration setup.',
  },
]

export const filterUserRecords = (users: UserRecord[], query: string, status: UserStatusFilter) => {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return users.filter((user) => {
    const matchesStatus = status === 'All' || user.accountStatus === status
    const matchesQuery =
      !normalizedQuery ||
      [user.name, user.email, user.role, ...user.projectAccess].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      )

    return matchesStatus && matchesQuery
  })
}

export const isProjectAssignableRole = (role: PrototypeRole): role is ProjectAssignableRole =>
  (projectAssignableRoles as readonly PrototypeRole[]).includes(role)

export const getManageableUserRoles = (actorRole: PrototypeRole) => [
  ...getAccessProfile(actorRole).userAdministration.createAndAuthorizeRoles,
]

export const getAssignableProjects = (
  actorRole: PrototypeRole,
  targetRole: PrototypeRole,
  projects: ProjectSummary[],
) => {
  if (!isProjectAssignableRole(targetRole)) {
    return []
  }

  return projects.filter((project) =>
    canConfigureProjectAssignment(actorRole, targetRole, project.id),
  )
}

export const canManageUserRecord = (actorRole: PrototypeRole, user: UserRecord) => {
  if (!canCreateOrAuthorizeRole(actorRole, user.role)) {
    return false
  }

  if (!isProjectAssignableRole(user.role)) {
    return true
  }

  return user.projectIds.every((projectId) =>
    canConfigureProjectAssignment(actorRole, user.role as ProjectAssignableRole, projectId),
  )
}

export const getProjectAccessLabels = (
  role: PrototypeRole,
  projectIds: readonly string[],
  projects: ProjectSummary[],
) => {
  if (isProjectAssignableRole(role)) {
    const projectTitles = new Map(projects.map((project) => [project.id, project.title]))
    const labels = projectIds.map((projectId) => projectTitles.get(projectId) ?? projectId)
    return labels.length > 0 ? labels : ['No project assigned']
  }

  if (role === 'System Administrator') return ['System administration']
  if (role === 'Grant Manager') return ['Organization grant portfolio']
  return ['Organization portfolio']
}

export const getUserAdministrationSummary = (actorRole: PrototypeRole) => {
  const roles = getManageableUserRoles(actorRole)

  if (roles.length === 0) {
    return 'This role has no prototype account creation, authorization, or assignment controls.'
  }

  if (actorRole === 'System Administrator') {
    return 'You can create and authorize every supported prototype role and configure relevant project assignments.'
  }

  return `You can create and authorize ${roles.join(' and ')} accounts within your permitted project scope.`
}

export const userAccountStatusTone = (status: UserAccountStatus) => {
  if (status === 'Active') return 'success' as const
  if (status === 'Invited') return 'info' as const
  return 'neutral' as const
}

export const getUserInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('') || 'U'
