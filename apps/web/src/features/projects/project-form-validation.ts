import { z } from 'zod'

import type { CreateProjectInput, ProjectDetail, UpdateProjectInput } from '@/types/pathways'

export const projectSetupSchema = z
  .object({
    objectives: z.string().trim().min(3, 'Enter project objectives.'),
    partners: z.string(),
    projectBudget: z.string(),
    targetBeneficiaries: z.string(),
    title: z.string().trim().min(3, 'Enter a project title.'),
    sector: z.string(),
    area: z.string().trim().min(2, 'Enter the implementation area.'),
    startDate: z.string().min(1, 'Choose a start date.'),
    endDate: z.string().min(1, 'Choose an end date.'),
    status: z.enum(['Active', 'Needs Attention', 'Planned', 'Completed']),
    description: z.string().trim().min(10, 'Enter a short project description.'),
    programManager: z.string(),
    projectManager: z.string(),
    monitoringOfficer: z.string(),
    projectOfficers: z.string(),
  })
  .refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

export type ProjectSetupSchema = z.infer<typeof projectSetupSchema>

export const toCreateProjectInput = (values: ProjectSetupSchema): CreateProjectInput => ({
  title: values.title,
  description: values.description,
  objectives: values.objectives,
  implementationArea: values.area,
  startDate: values.startDate,
  endDate: values.endDate,
  status: values.status,
})

export const toUpdateProjectInput = (
  values: ProjectSetupSchema,
  current: ProjectDetail,
): UpdateProjectInput => ({
  ...toCreateProjectInput(values),
  code: current.code,
  programId: current.programId ?? undefined,
  status:
    current.storedStatus === 'CANCELLED' && values.status === 'Needs Attention'
      ? 'CANCELLED'
      : values.status,
  expectedUpdatedAt: current.updatedAt ?? '',
})
