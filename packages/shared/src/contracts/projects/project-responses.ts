import { z } from 'zod'

import { storedProjectStatuses } from './project-requests'

// Response shapes of the projects routes, used as types and never parsed at runtime.

const projectTeamMemberResponse = z.object({
  userId: z.string(),
  fullName: z.string(),
  role: z.string(),
})

// One project as the detail, create, update and detail-list routes return it.
export const projectResponse = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  objectives: z.string().nullable(),
  implementationArea: z.string().nullable(),
  implementingPartners: z.string().nullable(),
  implementingPartnerRecords: z.array(z.object({ id: z.string(), name: z.string() })),
  sector: z.string().nullable(),
  targetBeneficiaries: z.number().int().nullable(),
  projectBudget: z.string().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(storedProjectStatuses),
  programId: z.string().nullable(),
  programManagerId: z.string().nullable(),
  programManager: z.string().nullable(),
  projectManagerId: z.string().nullable(),
  projectManager: z.string().nullable(),
  monitoringOfficerId: z.string().nullable(),
  monitoringOfficer: z.string().nullable(),
  projectOfficerIds: z.array(z.string()),
  projectOfficers: z.array(z.string()),
  team: z.array(projectTeamMemberResponse),
  updatedAt: z.string(),
})
export type ProjectResponse = z.infer<typeof projectResponse>

// A GET /projects row for a reader without projects.detail.read.
export const projectSummaryResponse = projectResponse.pick({
  id: true,
  code: true,
  title: true,
  status: true,
})
export type ProjectSummaryResponse = z.infer<typeof projectSummaryResponse>

// Body of the POST /projects/:projectId/archive answer.
export const archiveProjectResponse = z.object({ id: z.string(), archivedAt: z.string() })
export type ArchiveProjectResponse = z.infer<typeof archiveProjectResponse>
