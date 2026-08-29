import { type ProjectAssignableRole, projectAssignableRoles } from '@/lib/rbac/access-matrix'
import { canCreateOrAuthorizeRole, getAccessProfile } from '@/lib/rbac/can'
import { canConfigureProjectAssignment } from '@/lib/rbac/data-scope'
import type { ProjectSummary, UserAccountStatus, UserRecord } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

export type UserStatusFilter = 'All' | UserAccountStatus

export interface RoleSummary {
  role: PathwaysRole
  description: string
}

export const roleSummaries: RoleSummary[] = [
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
    description: 'System configuration, user records, labels, and future integration setup.',
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

export const isProjectAssignableRole = (role: PathwaysRole): role is ProjectAssignableRole =>
  (projectAssignableRoles as readonly PathwaysRole[]).includes(role)

export const getManageableUserRoles = (actorRole: PathwaysRole) => [
  ...getAccessProfile(actorRole).userAdministration.createAndAuthorizeRoles,
]

export const getAssignableProjects = (
  actorRole: PathwaysRole,
  targetRole: PathwaysRole,
  projects: ProjectSummary[],
  actorAssignedProjectIds: readonly string[] = [],
) => {
  if (!isProjectAssignableRole(targetRole)) {
    return []
  }

  return projects.filter((project) =>
    canConfigureProjectAssignment(actorRole, targetRole, project.id, actorAssignedProjectIds),
  )
}

export const canManageUserRecord = (
  actorRole: PathwaysRole,
  user: UserRecord,
  actorAssignedProjectIds: readonly string[] = [],
) => {
  if (!canCreateOrAuthorizeRole(actorRole, user.role)) {
    return false
  }

  if (!isProjectAssignableRole(user.role)) {
    return true
  }

  return user.projectIds.every((projectId) =>
    canConfigureProjectAssignment(
      actorRole,
      user.role as ProjectAssignableRole,
      projectId,
      actorAssignedProjectIds,
    ),
  )
}

export const getProjectAccessLabels = (
  role: PathwaysRole,
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

export const getUserAdministrationSummary = (actorRole: PathwaysRole) => {
  const roles = getManageableUserRoles(actorRole)

  if (roles.length === 0) {
    return 'This role has no account creation, authorization, or assignment controls.'
  }

  if (actorRole === 'System Administrator') {
    return 'You can create and authorize every supported role and configure relevant project assignments.'
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
