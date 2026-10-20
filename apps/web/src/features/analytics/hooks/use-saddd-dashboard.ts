'use client'

import { useEffect, useState } from 'react'

import { dashboardsClient } from '@/lib/api/dashboards'
import type { ProjectSummary } from '@/types/pathways'
import type { SadddDashboard } from '@pathways/shared'

export const useSadddDashboard = ({
  projectId,
  selectedProject,
  sadddEligible,
}: {
  projectId: string
  selectedProject: ProjectSummary | undefined
  sadddEligible: boolean
}) => {
  const [saddd, setSaddd] = useState<SadddDashboard | null>(null)
  const [sadddLoading, setSadddLoading] = useState(false)
  const [sadddError, setSadddError] = useState('')
  const [sadddLoadAttempt, setSadddLoadAttempt] = useState(0)

  useEffect(() => {
    if (!projectId || !selectedProject) {
      setSadddLoading(false)
      setSaddd(null)
      setSadddError('')
      return
    }
    void sadddLoadAttempt
    setSaddd(null)
    if (!sadddEligible) {
      setSadddLoading(false)
      setSadddError('')
      return
    }
    let active = true
    setSadddLoading(true)
    setSadddError('')
    dashboardsClient
      .getSadddDashboard({ projectId })
      .then((result) => {
        if (active) setSaddd(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setSadddError(caught instanceof Error ? caught.message : 'SADDD analysis is unavailable.')
      })
      .finally(() => {
        if (active) setSadddLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, sadddEligible, sadddLoadAttempt, selectedProject])

  return {
    resetSaddd: () => {
      setSaddd(null)
      setSadddLoading(false)
      setSadddError('')
    },
    retrySaddd: () => setSadddLoadAttempt((value) => value + 1),
    saddd,
    sadddError,
    sadddLoading,
  }
}
