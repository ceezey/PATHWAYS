'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { financeClient } from '@/lib/api/finance'

/** Budget lines of a project under one shared key, so the budget module and the activity expense panel use one cache entry. */
export const useBudgetsRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    'finance-budgets',
    projectId,
    'budgets.read',
    (signal) => financeClient.budgets(projectId, signal),
    enabled,
  )
