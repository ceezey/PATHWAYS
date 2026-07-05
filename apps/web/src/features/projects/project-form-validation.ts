import { z } from 'zod'

export const projectSetupSchema = z
  .object({
    title: z.string().min(3, 'Enter a project title.'),
    sector: z.string().min(2, 'Enter the project sector.'),
    area: z.string().min(2, 'Enter the implementation area.'),
    startDate: z.string().min(1, 'Choose a start date.'),
    endDate: z.string().min(1, 'Choose an end date.'),
    status: z.enum(['Active', 'Needs Attention', 'Planned', 'Completed']),
    budgetCode: z.string().min(2, 'Enter a budget code.'),
    description: z.string().min(10, 'Enter a short project description.'),
    programManager: z.string().min(2, 'Enter the Program Manager.'),
    projectManager: z.string().min(2, 'Enter the Project Manager.'),
    monitoringOfficer: z.string().min(2, 'Enter the Monitoring and Evaluation Officer.'),
    projectOfficers: z.string().min(2, 'Enter at least one Project Officer.'),
  })
  .refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

export type ProjectSetupSchema = z.infer<typeof projectSetupSchema>
