import type { BudgetRecord } from '@/types/pathways'

export const mockBudgets: BudgetRecord[] = [
  {
    id: 'budget-fm',
    projectId: 'futuremakers-ncr',
    plannedAmount: 4_200_000,
    actualSpending: 2_562_000,
  },
  {
    id: 'budget-yr',
    projectId: 'youth-rise-western-samar',
    plannedAmount: 3_100_000,
    actualSpending: 2_232_000,
  },
  {
    id: 'budget-ss',
    projectId: 'safe-spaces-northern-samar',
    plannedAmount: 2_800_000,
    actualSpending: 2_408_000,
  },
]
