import { z } from 'zod'

const activityFormBaseSchema = z
  .object({
    title: z.string().min(3, 'Enter an activity title.'),
    description: z.string().min(10, 'Enter a short activity description.'),
    startDate: z.string().min(1, 'Choose a start date.'),
    dueDate: z.string().min(1, 'Choose a due date.'),
    targetBeneficiaries: z.coerce.number().int().min(1, 'Enter target beneficiaries.'),
    budgetAllocation: z.coerce.number().min(1, 'Enter an activity budget.'),
    assignedOfficers: z.array(z.string()).min(1, 'Select at least one assigned officer.'),
    connectedIndicators: z.array(z.string()).min(1, 'Select at least one connected indicator.'),
    journeyStageId: z.string().min(1, 'Select a journey stage.'),
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

export const activityFormSchema = activityFormBaseSchema

export const createActivityFormSchema = ({
  indicatorIds,
  journeyStageIds,
  officerNames,
}: {
  indicatorIds: readonly string[]
  journeyStageIds: readonly string[]
  officerNames: readonly string[]
}) =>
  activityFormBaseSchema.superRefine((value, context) => {
    if (value.assignedOfficers.some((officer) => !officerNames.includes(officer))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select officers assigned to this project.',
        path: ['assignedOfficers'],
      })
    }

    if (value.connectedIndicators.some((indicatorId) => !indicatorIds.includes(indicatorId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select indicators from this project.',
        path: ['connectedIndicators'],
      })
    }

    if (!journeyStageIds.includes(value.journeyStageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a journey stage from this project.',
        path: ['journeyStageId'],
      })
    }
  })

export type ActivityFormSchema = z.infer<typeof activityFormBaseSchema>
