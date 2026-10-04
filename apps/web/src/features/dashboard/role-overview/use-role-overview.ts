'use client'

import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

/** Reads the role dashboard payload with the same grant gate as the action counts. */
export const useRoleOverview = () =>
  useAuthorizedRead('dashboard-role-overview', null, 'projects.read', () =>
    pathwaysClient.getRoleOverview(),
  )
