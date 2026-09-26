import type {
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  ProjectSummary,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import type { ProjectAssignableRole } from './access-matrix'
import { canConfigureProjectAssignmentsForRole, getAccessProfile } from './can'

type AssignedProjectIds = readonly string[]

const assignedProjectSet = (projectIds: AssignedProjectIds) => new Set(projectIds)

export const canAccessProjectForRole = (
  role: PathwaysRole,
  projectId: string,
  assignedProjectIds: AssignedProjectIds = [],
) => {
  const { projectAccess } = getAccessProfile(role)

  // Presentation only: portfolio arrays must already be scoped by the API.
  if (projectAccess === 'organization' || projectAccess === 'portfolio') {
    return true
  }

  return assignedProjectSet(assignedProjectIds).has(projectId)
}

export const scopeProjectsForRole = (
  projects: ProjectSummary[],
  role: PathwaysRole,
  assignedProjectIds: AssignedProjectIds = [],
) => projects.filter((project) => canAccessProjectForRole(role, project.id, assignedProjectIds))

export const scopeProjectRecordsForRole = <Record extends { projectId: string }>(
  records: readonly Record[],
  role: PathwaysRole,
  assignedProjectIds: AssignedProjectIds = [],
): Record[] =>
  records.filter((record) => canAccessProjectForRole(role, record.projectId, assignedProjectIds))

export const scopeBeneficiariesForRole = (
  beneficiaries: BeneficiaryRecord[],
  role: PathwaysRole,
  assignedProjectIds: AssignedProjectIds = [],
) =>
  beneficiaries.flatMap((beneficiary) => {
    const scopedBeneficiary = scopeBeneficiaryRecordForRole(beneficiary, role, assignedProjectIds)
    return scopedBeneficiary ? [scopedBeneficiary] : []
  })

export const scopeBeneficiaryRecordForRole = (
  beneficiary: BeneficiaryRecord,
  role: PathwaysRole,
  assignedProjectIds: AssignedProjectIds = [],
): BeneficiaryRecord | null => {
  const { beneficiaryDataAccess } = getAccessProfile(role)

  if (beneficiaryDataAccess === 'all-records') {
    return beneficiary
  }

  if (beneficiaryDataAccess === 'aggregate-only') {
    return null
  }

  const assignments = assignedProjectSet(assignedProjectIds)
  const projectIds = beneficiary.projectIds.filter((projectId) => assignments.has(projectId))

  if (projectIds.length === 0) {
    return null
  }

  return {
    ...beneficiary,
    projectIds,
    enrollments: beneficiary.enrollments.filter((item) => assignments.has(item.projectId)),
    participation: beneficiary.participation.filter((item) => assignments.has(item.projectId)),
    assessments: beneficiary.assessments.filter((item) => assignments.has(item.projectId)),
    notes: beneficiary.notes.filter((item) => assignments.has(item.projectId)),
  }
}

export const canAccessBeneficiaryForRole = (
  role: PathwaysRole,
  beneficiary: BeneficiaryRecord,
  assignedProjectIds: AssignedProjectIds = [],
) => scopeBeneficiaryRecordForRole(beneficiary, role, assignedProjectIds) !== null

export const scopeBeneficiaryMediaForRole = (
  mediaProof: BeneficiaryMediaProofRecord[],
  beneficiary: BeneficiaryRecord,
  role: PathwaysRole,
  assignedProjectIds: AssignedProjectIds = [],
) => {
  const scopedBeneficiary = scopeBeneficiaryRecordForRole(beneficiary, role, assignedProjectIds)

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

// SADDD must come from /dashboards/saddd. Raw Beneficiary arrays are never an
// acceptable analytics input, even for a role with beneficiary-detail permission.

export const canConfigureProjectAssignment = (
  actorRole: PathwaysRole,
  targetRole: ProjectAssignableRole,
  projectId: string,
  actorAssignedProjectIds: AssignedProjectIds = [],
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
    projectAssignmentScope === 'assigned-projects' &&
    canAccessProjectForRole(actorRole, projectId, actorAssignedProjectIds)
  )
}

// Frontend helpers are display-only. Pass server-authorized assignment IDs explicitly and enforce
// the same organization/project scope on every protected server request and database query.
