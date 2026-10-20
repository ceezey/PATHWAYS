import { type CanonicalRole, canAssignRole } from '@pathways/shared'

import type { UserRecord } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import type { ProjectSetupSchema } from '../project-form.utils'

export type TeamFieldName =
  | 'programManager'
  | 'projectManager'
  | 'monitoringOfficer'
  | 'projectOfficers'

export const teamRoles: Record<TeamFieldName, PathwaysRole> = {
  programManager: 'Program Manager',
  projectManager: 'Project Manager',
  monitoringOfficer: 'Monitoring and Evaluation Officer',
  projectOfficers: 'Project Officer',
}

const hideableTargets: Record<TeamFieldName, CanonicalRole | null> = {
  programManager: null,
  projectManager: 'PROJECT_MANAGER',
  monitoringOfficer: 'MONITORING_AND_EVALUATION_OFFICER',
  projectOfficers: 'PROJECT_OFFICER',
}

/** Program and Project Managers only see the team fields they may assign; other roles see all. */
export const hiddenTeamFields = (actorRole: string | undefined): TeamFieldName[] => {
  if (actorRole !== 'PROJECT_MANAGER' && actorRole !== 'PROGRAM_MANAGER') return []
  return (Object.keys(hideableTargets) as TeamFieldName[]).filter((field) => {
    const target = hideableTargets[field]
    return !target || !canAssignRole(actorRole, target)
  })
}

export const getEligibleTeamUsers = (users: UserRecord[], role: PathwaysRole) =>
  users.filter((user) => user.role === role && user.accountStatus === 'Active')

export const parseProjectOfficerNames = (value: string) =>
  value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

export const validateProjectTeamSelections = (
  values: Pick<ProjectSetupSchema, TeamFieldName>,
  users: UserRecord[],
) => {
  const errors: Partial<Record<TeamFieldName, string>> = {}
  // A blank single-assignment field means "None" (an intentional, always
  // allowed clear) rather than an unresolved selection, so it must never be
  // treated as a name to validate against the eligible set. Filtering it
  // out here keeps a blank field from being flagged as an invalid legacy
  // value whenever the role happens to have at least one eligible user.
  const selectedByField: Record<TeamFieldName, string[]> = {
    programManager: values.programManager ? [values.programManager] : [],
    projectManager: values.projectManager ? [values.projectManager] : [],
    monitoringOfficer: values.monitoringOfficer ? [values.monitoringOfficer] : [],
    projectOfficers: parseProjectOfficerNames(values.projectOfficers),
  }

  for (const fieldName of Object.keys(teamRoles) as TeamFieldName[]) {
    const role = teamRoles[fieldName]
    const eligibleNames = new Set(getEligibleTeamUsers(users, role).map((user) => user.name))
    const selectedNames = selectedByField[fieldName]

    if (
      eligibleNames.size > 0 &&
      selectedNames.length > 0 &&
      selectedNames.some((name) => !eligibleNames.has(name))
    ) {
      errors[fieldName] =
        fieldName === 'projectOfficers'
          ? 'Select at least one active Project Officer from the list.'
          : `Select an active ${role} from the list.`
    }
  }

  return errors
}
