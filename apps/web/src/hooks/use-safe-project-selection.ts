'use client'

import { useEffect, useMemo, useState } from 'react'

export const useSafeProjectSelection = (projectIds: string[], preferredProjectId?: string) => {
  const signature = projectIds.join('|')
  const safeInitialValue =
    preferredProjectId && projectIds.includes(preferredProjectId)
      ? preferredProjectId
      : (projectIds[0] ?? '')
  const [projectId, setProjectId] = useState(safeInitialValue)

  useEffect(() => {
    const currentProjectIds = signature ? signature.split('|') : []
    setProjectId((current) =>
      currentProjectIds.includes(current)
        ? current
        : preferredProjectId && currentProjectIds.includes(preferredProjectId)
          ? preferredProjectId
          : (currentProjectIds[0] ?? ''),
    )
  }, [preferredProjectId, signature])

  return useMemo(() => [projectId, setProjectId] as const, [projectId])
}
