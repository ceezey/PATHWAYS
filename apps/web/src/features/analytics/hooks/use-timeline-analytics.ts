'use client'

import { useEffect, useState } from 'react'

import { analyticsClient } from '@/lib/api/analytics'
import type { TimelineAnalytics } from '@pathways/shared'

import type { AnalysisView } from '../analytics.copy'

export const useTimelineAnalytics = ({
  analysisView,
  canReadSurveyTimeline,
  projectId,
}: {
  analysisView: AnalysisView
  canReadSurveyTimeline: boolean
  projectId: string
}) => {
  const [timeline, setTimeline] = useState<TimelineAnalytics | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')
  const [timelineLoadAttempt, setTimelineLoadAttempt] = useState(0)

  // Timeline adherence uses the business reporting date server-side; no period selection needed.
  useEffect(() => {
    if (!projectId || !canReadSurveyTimeline || analysisView !== 'timeline') {
      setTimelineLoading(false)
      setTimeline(null)
      setTimelineError('')
      return
    }
    void timelineLoadAttempt
    let active = true
    setTimelineLoading(true)
    setTimeline(null)
    setTimelineError('')
    analyticsClient
      .getTimelineAnalytics({ projectId })
      .then((result) => {
        if (active) setTimeline(result)
      })
      .catch((caught: unknown) => {
        if (active)
          setTimelineError(
            caught instanceof Error ? caught.message : 'Timeline analytics could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setTimelineLoading(false)
      })
    return () => {
      active = false
    }
  }, [analysisView, canReadSurveyTimeline, projectId, timelineLoadAttempt])

  return {
    resetTimeline: () => {
      setTimeline(null)
      setTimelineError('')
    },
    retryTimeline: () => setTimelineLoadAttempt((value) => value + 1),
    timeline,
    timelineError,
    timelineLoading,
  }
}
