import type {
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  BeneficiarySadddAggregate,
  ProjectDetail,
  ProjectSummary,
} from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import { type ProjectAssignableRole, projectAssignableRoles } from './access-matrix'
import { canConfigureProjectAssignmentsForRole, getAccessProfile } from './can'

export interface PrototypeProjectAssignment {
  id: string
  assigneeName: string
  role: ProjectAssignableRole
  projectIds: readonly string[]
}

export const prototypeProjectAssignments = [
  {
    id: 'assignment-project-manager-a',
    assigneeName: 'Project Manager A',
    role: 'Project Manager',
    projectIds: ['futuremakers-ncr'],
  },
  {
    id: 'assignment-me-officer-a',
    assigneeName: 'Monitoring and Evaluation Officer A',
    role: 'Monitoring and Evaluation Officer',
    projectIds: ['futuremakers-ncr', 'grassroots-centers-navotas'],
  },
  {
    id: 'assignment-project-officer-a',
    assigneeName: 'Project Officer A',
    role: 'Project Officer',
    projectIds: ['futuremakers-ncr'],
  },
] as const satisfies readonly PrototypeProjectAssignment[]

const localProjectIdsByRole = new Map<ProjectAssignableRole, Set<string>>()
const projectAssignmentOverridesByRole = new Map<ProjectAssignableRole, Set<string>>()
const PROJECT_ASSIGNMENT_STORAGE_KEY = 'pathways.prototypeProjectAssignments'
const PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY = 'pathways.prototypeUserAssignments'

type StoredProjectAssignments = Partial<Record<ProjectAssignableRole, string[]>>

const readStoredProjectAssignments = (
  storageKey = PROJECT_ASSIGNMENT_STORAGE_KEY,
): StoredProjectAssignments => {
  if (typeof window === 'undefined') {
    return {}
  }

  const value = window.localStorage.getItem(storageKey)

  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const assignments: StoredProjectAssignments = {}

    for (const role of projectAssignableRoles) {
      const projectIds = parsed[role]

      if (Array.isArray(projectIds)) {
        assignments[role] = projectIds.filter(
          (projectId): projectId is string => typeof projectId === 'string',
        )
      }
    }

    return assignments
  } catch {
    return {}
  }
}

export const registerPrototypeProjectTeamAssignments = (
  project: Pick<ProjectDetail, 'id' | 'projectManager' | 'monitoringOfficer' | 'projectOfficers'>,
) => {
  const storedAssignments = readStoredProjectAssignments()
  const storedOverrides = readStoredProjectAssignments(PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY)

  for (const assignment of prototypeProjectAssignments) {
    const matchesAssignee =
      (assignment.role === 'Project Manager' &&
        project.projectManager === assignment.assigneeName) ||
      (assignment.role === 'Monitoring and Evaluation Officer' &&
        project.monitoringOfficer === assignment.assigneeName) ||
      (assignment.role === 'Project Officer' &&
        project.projectOfficers.includes(assignment.assigneeName))

    if (!matchesAssignee) {
      continue
    }

    const projectIds = localProjectIdsByRole.get(assignment.role) ?? new Set<string>()
    projectIds.add(project.id)
    localProjectIdsByRole.set(assignment.role, projectIds)

    storedAssignments[assignment.role] = [
      ...new Set([...(storedAssignments[assignment.role] ?? []), project.id]),
    ]

    if (Object.hasOwn(storedOverrides, assignment.role)) {
      storedOverrides[assignment.role] = [
        ...new Set([...(storedOverrides[assignment.role] ?? []), project.id]),
      ]
      projectAssignmentOverridesByRole.set(
        assignment.role,
        new Set(storedOverrides[assignment.role]),
      )
    }
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROJECT_ASSIGNMENT_STORAGE_KEY, JSON.stringify(storedAssignments))
    window.localStorage.setItem(
      PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY,
      JSON.stringify(storedOverrides),
    )
  }
}

export const setPrototypeProjectAssignments = (
  role: ProjectAssignableRole,
  projectIds: readonly string[],
) => {
  const normalizedProjectIds = [...new Set(projectIds.filter(Boolean))]
  projectAssignmentOverridesByRole.set(role, new Set(normalizedProjectIds))

  if (typeof window !== 'undefined') {
    const storedOverrides = readStoredProjectAssignments(PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY)
    storedOverrides[role] = normalizedProjectIds
    window.localStorage.setItem(
      PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY,
      JSON.stringify(storedOverrides),
    )
  }
}

export const resetPrototypeProjectAssignmentOverrides = () => {
  projectAssignmentOverridesByRole.clear()

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY)
  }
}

export const getAssignedProjectIds = (role: PrototypeRole): readonly string[] => {
  const assignableRole = role as ProjectAssignableRole
  const inMemoryOverride = projectAssignmentOverridesByRole.get(assignableRole)

  if (inMemoryOverride) {
    return [...inMemoryOverride]
  }

  const storedOverrides = readStoredProjectAssignments(PROJECT_ASSIGNMENT_OVERRIDE_STORAGE_KEY)

  if (Object.hasOwn(storedOverrides, assignableRole)) {
    return [...new Set(storedOverrides[assignableRole] ?? [])]
  }

  const configuredProjectIds =
    prototypeProjectAssignments.find((assignment) => assignment.role === role)?.projectIds ?? []
  const locallyAssignedProjectIds = localProjectIdsByRole.get(assignableRole) ?? []
  const storedProjectIds = readStoredProjectAssignments()[assignableRole] ?? []

  return [...new Set([...configuredProjectIds, ...locallyAssignedProjectIds, ...storedProjectIds])]
}

export const canAccessProjectForRole = (role: PrototypeRole, projectId: string) => {
  const { projectAccess } = getAccessProfile(role)

  if (projectAccess === 'organization' || projectAccess === 'portfolio') {
    return true
  }

  return getAssignedProjectIds(role).includes(projectId)
}

export const scopeProjectsForRole = (projects: ProjectSummary[], role: PrototypeRole) =>
  projects.filter((project) => canAccessProjectForRole(role, project.id))

export const scopeProjectRecordsForRole = <Record extends { projectId: string }>(
  records: readonly Record[],
  role: PrototypeRole,
): Record[] => records.filter((record) => canAccessProjectForRole(role, record.projectId))

export const scopeBeneficiariesForRole = (
  beneficiaries: BeneficiaryRecord[],
  role: PrototypeRole,
) =>
  beneficiaries.flatMap((beneficiary) => {
    const scopedBeneficiary = scopeBeneficiaryRecordForRole(beneficiary, role)
    return scopedBeneficiary ? [scopedBeneficiary] : []
  })

export const scopeBeneficiaryRecordForRole = (
  beneficiary: BeneficiaryRecord,
  role: PrototypeRole,
): BeneficiaryRecord | null => {
  const { beneficiaryDataAccess } = getAccessProfile(role)

  if (beneficiaryDataAccess === 'all-records') {
    return beneficiary
  }

  if (beneficiaryDataAccess === 'aggregate-only') {
    return null
  }

  const assignedProjectIds = new Set(getAssignedProjectIds(role))
  const projectIds = beneficiary.projectIds.filter((projectId) => assignedProjectIds.has(projectId))

  if (projectIds.length === 0) {
    return null
  }

  return {
    ...beneficiary,
    projectIds,
    enrollments: beneficiary.enrollments.filter((item) => assignedProjectIds.has(item.projectId)),
    participation: beneficiary.participation.filter((item) =>
      assignedProjectIds.has(item.projectId),
    ),
    assessments: beneficiary.assessments.filter((item) => assignedProjectIds.has(item.projectId)),
    notes: beneficiary.notes.filter((item) => assignedProjectIds.has(item.projectId)),
  }
}

export const canAccessBeneficiaryForRole = (role: PrototypeRole, beneficiary: BeneficiaryRecord) =>
  scopeBeneficiaryRecordForRole(beneficiary, role) !== null

export const scopeBeneficiaryMediaForRole = (
  mediaProof: BeneficiaryMediaProofRecord[],
  beneficiary: BeneficiaryRecord,
  role: PrototypeRole,
) => {
  const scopedBeneficiary = scopeBeneficiaryRecordForRole(beneficiary, role)

  if (!scopedBeneficiary) {
    return []
  }

  const visibleProjectIds = new Set(scopedBeneficiary.projectIds)
  return mediaProof.filter(
    (item) =>
      item.beneficiaryId === beneficiary.id &&
      (getAccessProfile(role).beneficiaryDataAccess === 'all-records' ||
        visibleProjectIds.has(item.projectId)),
  )
}

export const buildBeneficiarySadddAggregatesForRole = (
  beneficiaries: BeneficiaryRecord[],
  role: PrototypeRole,
): BeneficiarySadddAggregate[] => {
  const aggregateCounts = new Map<string, BeneficiarySadddAggregate>()

  for (const beneficiary of beneficiaries) {
    const accessibleProjectIds = beneficiary.projectIds.filter((projectId) =>
      canAccessProjectForRole(role, projectId),
    )

    for (const projectId of accessibleProjectIds) {
      const key = [
        projectId,
        beneficiary.sex,
        beneficiary.ageGroup,
        beneficiary.disabilityStatus,
      ].join('::')
      const current = aggregateCounts.get(key)

      aggregateCounts.set(key, {
        projectId,
        sex: beneficiary.sex,
        ageGroup: beneficiary.ageGroup,
        disabilityStatus: beneficiary.disabilityStatus,
        count: (current?.count ?? 0) + 1,
      })
    }
  }

  return [...aggregateCounts.values()]
}

export const canConfigureProjectAssignment = (
  actorRole: PrototypeRole,
  targetRole: ProjectAssignableRole,
  projectId: string,
) => {
  if (!canConfigureProjectAssignmentsForRole(actorRole, targetRole)) {
    return false
  }

  const { projectAssignmentScope } = getAccessProfile(actorRole).userAdministration

  if (
    projectAssignmentScope === 'all-projects' ||
    projectAssignmentScope === 'portfolio-projects'
  ) {
    return true
  }

  return (
    projectAssignmentScope === 'assigned-projects' && canAccessProjectForRole(actorRole, projectId)
  )
}

// TODO(RBAC): Enforce role capabilities and project assignments on authenticated server requests and database queries.
// TODO(DATABASE): Apply organization_id and project-scope filtering to all protected queries.
