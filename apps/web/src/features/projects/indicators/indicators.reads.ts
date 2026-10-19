'use client'

import { type AuthorizedReadSpec, useAuthorizedRead } from '@/hooks/use-authorized-read'
import { indicatorLibraryClient, indicatorsClient } from '@/lib/api/indicators'

const summary = { freshness: 'summary' } as const

/** Stable resource keys, so the library page and the use-from-library card share one library read. */
const indicatorReadResources = {
  library: 'indicator-library',
  projectIndicators: 'project-indicators',
} as const

/** The library page reads live; the use-from-library card passes summary freshness and its own enabled flag. */
export const useIndicatorLibraryRead = (
  enabled = true,
  options: { freshness?: 'summary' | 'live' } = {},
) =>
  useAuthorizedRead(
    indicatorReadResources.library,
    null,
    'indicators.library.read',
    () => indicatorLibraryClient.list(),
    enabled,
    options,
  )

/** Full indicator rows; `getIndicators` is the same request projected to code and label. */
export const projectIndicatorsSpec = (projectId: string) =>
  ({
    resource: indicatorReadResources.projectIndicators,
    permission: 'indicators.read',
    read: (signal) => indicatorsClient.getProjectIndicators(projectId, signal),
  }) satisfies AuthorizedReadSpec

export const useProjectIndicatorsRead = (projectId: string, enabled = true) => {
  const { resource, permission, read } = projectIndicatorsSpec(projectId)
  return useAuthorizedRead(resource, projectId, permission, read, enabled, summary)
}
