'use client'

import { useMemo } from 'react'

import { coreDataClient } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

import { useProjectActivitiesRead, useProjectOverviewMetricsRead } from '../use-project-reads'
import {
  buildActivityRows,
  deriveAlerts,
  deriveRecommendations,
  efficiencyRatio,
  remaining,
  toNumber,
  utilization,
} from './budget-math'

/** Reads budgets, expenses and overview metrics, and derives totals, rows and alerts. */
export const useBudgetModule = (projectId: string) => {
  const budgets = useAuthorizedRead('finance-budgets', projectId, 'budgets.read', (signal) =>
    coreDataClient.budgets(projectId, signal),
  )
  const expenses = useAuthorizedRead('finance-expenses', projectId, 'expenses.read', (signal) =>
    coreDataClient.expenses(projectId, signal),
  )
  const metrics = useProjectOverviewMetricsRead(projectId)
  const activities = useProjectActivitiesRead(projectId)

  const derived = useMemo(() => {
    const budgetRows = budgets.data ?? []
    const expenseRows = expenses.data ?? []
    const rows = buildActivityRows(budgetRows, expenseRows, activities.data ?? [])
    const allocated = rows.reduce((sum, row) => sum + row.allocated, 0)
    const used = rows.reduce((sum, row) => sum + row.used, 0)
    const pending = rows.reduce((sum, row) => sum + row.pending, 0)
    const budgetPct = utilization(used, allocated)
    const kpiValue = metrics.data?.kpiAchievement?.metric.value
    const kpiPct = kpiValue === null || kpiValue === undefined ? null : toNumber(kpiValue)
    return {
      totals: {
        allocated,
        used,
        pending,
        remaining: remaining(allocated, used),
        utilization: budgetPct,
        kpiPct,
        efficiency: efficiencyRatio(kpiPct, budgetPct),
      },
      activityRows: rows,
      alerts: deriveAlerts(rows, expenseRows, allocated, used),
      recommendations: deriveRecommendations(rows),
    }
  }, [budgets.data, expenses.data, activities.data, metrics.data])

  const refresh = async () => {
    await Promise.all([budgets.refetch(), expenses.refetch()])
  }
  return {
    budgets: budgets.data ?? [],
    expenses: expenses.data ?? [],
    activities: activities.data ?? [],
    isPending: budgets.isPending || expenses.isPending,
    isError: budgets.isError || expenses.isError,
    refresh,
    ...derived,
  }
}
