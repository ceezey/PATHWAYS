'use client'

import { useEffect, useState } from 'react'

import { analyticsClient } from '@/lib/api/analytics'
import type { DescriptiveAnalytics } from '@pathways/shared'

import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'

export const useDescriptiveAnalytics = ({
  canReadDescriptive,
  projectId,
  selectedPeriod,
}: {
  canReadDescriptive: boolean
  projectId: string
  selectedPeriod: AnalyticsReportingPeriod | undefined
}) => {
  const [descriptive, setDescriptive] = useState<DescriptiveAnalytics | null>(null)
  const [descriptiveLoading, setDescriptiveLoading] = useState(false)
  const [descriptiveError, setDescriptiveError] = useState('')
  const [descriptiveLoadAttempt, setDescriptiveLoadAttempt] = useState(0)

  useEffect(() => {
    if (!projectId || !selectedPeriod || !canReadDescriptive) {
      setDescriptiveLoading(false)
      setDescriptive(null)
      setDescriptiveError('')
      return
    }
    void descriptiveLoadAttempt
    let active = true
    setDescriptiveLoading(true)
    setDescriptive(null)
    setDescriptiveError('')
    analyticsClient
      .getDescriptiveAnalytics({
        projectId,
        periodStart: selectedPeriod.start,
        periodEnd: selectedPeriod.end,
      })
      .then((result) => {
        if (active) setDescriptive(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setDescriptiveError(
            caught instanceof Error ? caught.message : 'Descriptive statistics are unavailable.',
          )
      })
      .finally(() => {
        if (active) setDescriptiveLoading(false)
      })
    return () => {
      active = false
    }
  }, [canReadDescriptive, descriptiveLoadAttempt, projectId, selectedPeriod])

  return {
    descriptive,
    descriptiveError,
    descriptiveLoading,
    resetDescriptive: () => {
      setDescriptive(null)
      setDescriptiveError('')
    },
    retryDescriptive: () => setDescriptiveLoadAttempt((value) => value + 1),
  }
}
