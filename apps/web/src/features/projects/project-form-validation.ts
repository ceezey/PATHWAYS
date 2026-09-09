import { z } from 'zod'

import type { CreateProjectInput } from '@/types/pathways'

export const projectSetupSchema = z
  .object({
    objectives: z.string().trim().min(3, 'Enter project objectives.'),
    partners: z.string().trim().min(2, 'Enter implementing partners.'),
    projectBudget: z
      .string()
      .refine(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
        'Enter a positive project budget.',
      ),
    title: z.string().min(3, 'Enter a project title.'),
    sector: z.string().min(2, 'Enter the project sector.'),
    area: z.string().min(2, 'Enter the implementation area.'),
    startDate: z.string().min(1, 'Choose a start date.'),
    endDate: z.string().min(1, 'Choose an end date.'),
    status: z.enum(['Active', 'Needs Attention', 'Planned', 'Completed']),
    description: z.string().min(10, 'Enter a short project description.'),
    programManager: z.string().min(2, 'Select the Program Manager.'),
    projectManager: z.string().min(2, 'Select the Project Manager.'),
    monitoringOfficer: z.string().min(2, 'Select the Monitoring and Evaluation Officer.'),
    projectOfficers: z.string().min(2, 'Select at least one Project Officer.'),
  })
  .refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

export type ProjectSetupSchema = z.infer<typeof projectSetupSchema>

export const toCreateProjectInput = (values: ProjectSetupSchema): CreateProjectInput => ({
  ...values,
  projectBudget: Number(values.projectBudget),
  projectOfficers: values.projectOfficers
    .split(',')
    .map((officer) => officer.trim())
    .filter(Boolean),
})
