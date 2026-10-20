'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { dashboardsClient } from '@/lib/api/dashboards'

/** Reads the role dashboard payload with the same grant gate as the action counts. */
export const useRoleOverview = () =>
  useAuthorizedRead('dashboard-role-overview', null, 'projects.read', () =>
    dashboardsClient.getRoleOverview(),
  )
