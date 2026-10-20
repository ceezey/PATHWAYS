'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { dashboardsClient } from '@/lib/api/dashboards'

/** Reads the action counts under the one resource key the action row and the role overview share. */
export const useDashboardActionCounts = (enabled = true) =>
  useAuthorizedRead(
    'dashboard-action-counts',
    null,
    'projects.read',
    () => dashboardsClient.getDashboardActionCounts(),
    enabled,
  )
