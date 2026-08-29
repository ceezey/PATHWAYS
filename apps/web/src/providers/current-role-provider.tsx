'use client'

import { createContext, useContext, useMemo } from 'react'

import { useSession } from '@/hooks/use-session'
import { type PathwaysRole, isPathwaysRole } from '@/types/pathways-role'

interface CurrentRoleContextValue {
  role: PathwaysRole | null
  assignedProjectIds: readonly string[]
}

const CurrentRoleContext = createContext<CurrentRoleContextValue | null>(null)

const roleAliases: Record<string, PathwaysRole> = {
  admin: 'System Administrator',
  system_administrator: 'System Administrator',
  grant_manager: 'Grant Manager',
  program_manager: 'Program Manager',
  project_manager: 'Project Manager',
  project_officer: 'Project Officer',
  m_and_e_staff: 'Monitoring and Evaluation Officer',
  monitoring_and_evaluation_officer: 'Monitoring and Evaluation Officer',
}

const parseRole = (value: unknown): PathwaysRole | null => {
  if (isPathwaysRole(value)) {
    return value
  }

  return typeof value === 'string' ? (roleAliases[value] ?? null) : null
}

const getSessionRole = (metadata: Record<string, unknown> | undefined): PathwaysRole | null => {
  if (!metadata) {
    return null
  }

  const candidates = [metadata.role, ...(Array.isArray(metadata.roles) ? metadata.roles : [])]
  const roles = [
    ...new Set(candidates.map(parseRole).filter((role): role is PathwaysRole => role !== null)),
  ]

  return roles.length === 1 ? roles[0] : null
}

const getSessionProjectIds = (metadata: Record<string, unknown> | undefined): readonly string[] => {
  if (!metadata) {
    return []
  }

  const value = metadata.assigned_project_ids ?? metadata.project_ids ?? metadata.assignedProjectIds

  return Array.isArray(value)
    ? [...new Set(value.filter((projectId): projectId is string => typeof projectId === 'string'))]
    : []
}

export const CurrentRoleProvider = ({ children }: { children: React.ReactNode }) => {
  const { session } = useSession()
  const value = useMemo(
    () => ({
      assignedProjectIds: getSessionProjectIds(session?.user.app_metadata),
      role: getSessionRole(session?.user.app_metadata),
    }),
    [session],
  )

  return <CurrentRoleContext.Provider value={value}>{children}</CurrentRoleContext.Provider>
}

export const useCurrentRole = () => {
  const context = useContext(CurrentRoleContext)

  if (!context) {
    throw new Error('useCurrentRole must be used within CurrentRoleProvider')
  }

  return context
}
