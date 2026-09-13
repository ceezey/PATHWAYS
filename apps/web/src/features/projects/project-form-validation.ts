import { z } from 'zod'

export const projectSetupSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Enter a project code.')
      .max(40)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, numbers, hyphens, or underscores.'),
    title: z.string().trim().min(3, 'Enter a project title.').max(160),
    implementationArea: z.string().trim().min(2, 'Enter the implementation area.').max(240),
    startDate: z.string().min(1, 'Choose a start date.'),
    endDate: z.string().min(1, 'Choose an end date.'),
    status: z.enum(['Active', 'Needs Attention', 'Planned', 'Completed']),
    description: z.string().trim().min(10, 'Enter a short project description.').max(2000),
    objectives: z.string().trim().min(10, 'Enter the project objectives.').max(4000),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

export type ProjectSetupSchema = z.infer<typeof projectSetupSchema>
