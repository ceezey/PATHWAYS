import { z } from 'zod'

export const activityFormSchema = z
  .object({
    title: z.string().min(3, 'Enter an activity title.'),
    description: z.string().min(10, 'Enter a short activity description.'),
    startDate: z.string().min(1, 'Choose a start date.'),
    dueDate: z.string().min(1, 'Choose a due date.'),
    targetBeneficiaries: z.coerce.number().int().min(1, 'Enter target beneficiaries.'),
    budgetAllocation: z.coerce.number().min(1, 'Enter an activity budget.'),
    assignedOfficers: z.string().min(2, 'Enter at least one assigned officer.'),
    connectedIndicators: z.string().min(2, 'Enter at least one indicator code or ID.'),
    journeyStageId: z.string().min(2, 'Enter a journey-stage placeholder.'),
    status: z
      .enum(['Planned', 'In Progress', 'For Review', 'Overdue', 'Completed'])
      .default('Planned'),
    progress: z.coerce.number().min(0).max(100).default(0),
    beneficiariesReached: z.coerce.number().int().min(0).default(0),
    budgetLogged: z.coerce.number().min(0).default(0),
  })
  .refine((value) => new Date(value.dueDate) >= new Date(value.startDate), {
    message: 'Due date must be on or after the start date.',
    path: ['dueDate'],
  })

export type ActivityFormSchema = z.infer<typeof activityFormSchema>
