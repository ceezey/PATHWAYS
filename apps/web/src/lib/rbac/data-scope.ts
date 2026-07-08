import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import { can } from './can'

const projectOfficerProjectIds = new Set(['futuremakers-ncr'])
const monitoredProjectIds = new Set(['futuremakers-ncr', 'safe-spaces-northern-samar'])
const managedProjectIds = new Set(['futuremakers-ncr', 'youth-rise-western-samar'])

export const scopeProjectsForRole = (projects: ProjectSummary[], role: PrototypeRole) => {
  if (role === 'Project Officer') {
    return projects.filter((project) => projectOfficerProjectIds.has(project.id))
  }

  if (role === 'Monitoring and Evaluation Officer') {
    return projects.filter((project) => monitoredProjectIds.has(project.id))
  }

  if (role === 'Project Manager') {
    return projects.filter((project) => managedProjectIds.has(project.id))
  }

  return projects
}

export const scopeBeneficiariesForRole = (
  beneficiaries: BeneficiaryRecord[],
  role: PrototypeRole,
) => {
  if (!can(role, 'beneficiaries.scoped_view')) {
    return beneficiaries
  }

  return beneficiaries.filter((beneficiary) =>
    beneficiary.projectIds.some((projectId) => projectOfficerProjectIds.has(projectId)),
  )
}

// TODO(RBAC): Enforce organization, program, project, and activity data scope server-side.
// TODO(DATABASE): Apply organization_id and project-scope filtering to all protected queries.
