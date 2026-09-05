import { z } from 'zod'

export const budgetAllocationSchema = z.object({
  plannedAmount: z
    .number({
      invalid_type_error: 'Enter a planned allocation in whole PHP units.',
      required_error: 'Enter a planned allocation.',
    })
    .finite('Enter a finite planned allocation.')
    .int('Enter the planned allocation in whole PHP units.')
    .min(1, 'Planned allocation must be at least PHP 1.')
    .refine(Number.isSafeInteger, 'Enter an amount within the supported numeric range.'),
})

export type BudgetAllocationSchema = z.infer<typeof budgetAllocationSchema>

export const allocationCreatesOverspend = (plannedAmount: number, actualSpending: number) =>
  Number.isFinite(plannedAmount) && plannedAmount < actualSpending
