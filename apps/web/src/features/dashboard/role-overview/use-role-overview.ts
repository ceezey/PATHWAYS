'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { pathwaysClient } from '@/lib/services/pathways-client'

/** Reads the role dashboard payload with the same grant gate as the action counts. */
export const useRoleOverview = () =>
  useAuthorizedRead('dashboard-role-overview', null, 'projects.read', () =>
    pathwaysClient.getRoleOverview(),
  )
