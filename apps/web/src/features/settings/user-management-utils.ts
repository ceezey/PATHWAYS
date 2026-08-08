import type { UserAccountStatus, UserRecord } from '@/types/pathways'
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
