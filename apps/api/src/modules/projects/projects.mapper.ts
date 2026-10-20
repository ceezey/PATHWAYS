import type { ProjectResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

export const projectSelection = {
  id: true,
  code: true,
  title: true,
  description: true,
  objectives: true,
  implementationArea: true,
  implementingPartners: true,
  implementingPartnerLinks: {
    select: { partner: { select: { id: true, name: true } } },
    orderBy: { partnerId: 'asc' as const },
    take: 20,
  },
  sector: true,
  targetBeneficiaries: true,

  programManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
  programId: true,
  updatedAt: true,
  programManager: { select: { id: true, fullName: true, email: true } },
  userProjectAssignment_project: {
    where: { status: 'ACTIVE' as const, endedAt: null },
    select: {
      user: { select: { id: true, fullName: true, email: true, role: { select: { code: true } } } },
    },
    orderBy: { id: 'asc' as const },
    take: 50,
  },
} satisfies Prisma.ProjectSelect

const teamPreviewLimit = 8

export function mapProject(
  project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>,
  projectBudget: string | null,
): ProjectResponse {
  const team = project.userProjectAssignment_project
  const projectManagers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_MANAGER',
  )
  const monitoringOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'MONITORING_AND_EVALUATION_OFFICER',
  )
  const projectOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_OFFICER',
  )
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description,
    objectives: project.objectives,
    implementationArea: project.implementationArea,
    implementingPartners: project.implementingPartners,
    implementingPartnerRecords: project.implementingPartnerLinks.map((link) => link.partner),
    sector: project.sector,
    targetBeneficiaries: project.targetBeneficiaries,
    projectBudget,

    startDate: project.startDate?.toISOString().slice(0, 10),
    endDate: project.endDate?.toISOString().slice(0, 10),
    status: project.status,
    programId: project.programId,
    programManagerId: project.programManagerId,
    programManager: project.programManager?.fullName ?? null,
    projectManagerId: projectManagers[0]?.user.id ?? null,
    projectManager: projectManagers[0]?.user.fullName ?? null,
    monitoringOfficerId: monitoringOfficers[0]?.user.id ?? null,
    monitoringOfficer: monitoringOfficers[0]?.user.fullName ?? null,
    projectOfficerIds: projectOfficers.map((assignment) => assignment.user.id),
    projectOfficers: projectOfficers.map((assignment) => assignment.user.fullName),
    team: team.slice(0, teamPreviewLimit).map(({ user }) => ({
      userId: user.id,
      fullName: user.fullName,
      role: user.role.code,
    })),
    updatedAt: project.updatedAt.toISOString(),
  }
}
