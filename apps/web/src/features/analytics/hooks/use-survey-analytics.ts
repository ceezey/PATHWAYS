'use client'

import { useEffect, useState } from 'react'

import { analyticsClient } from '@/lib/api/analytics'
import type { SurveyAnalytics } from '@pathways/shared'

import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'
import {
  type AnalysisView,
  SURVEY_CLOSED_PERIOD_MESSAGE,
  SURVEY_PERIOD_MESSAGE,
  SURVEY_RESTRICTED_MESSAGE,
  type SurveyErrorKind,
} from '../analytics.copy'
import { surveyErrorKindFor } from '../analytics.utils'

export const useSurveyAnalytics = ({
  analysisView,
  projectId,
  surveyFrozenOnly,
  surveyPeriod,
  surveyUnavailable,
}: {
  analysisView: AnalysisView
  projectId: string
  surveyFrozenOnly: boolean
  surveyPeriod: AnalyticsReportingPeriod | undefined
  surveyUnavailable: boolean
}) => {
  // F9 survey/timeline analytics (analytics.descriptive.survey.v1 / .timeline.v1).
  const [survey, setSurvey] = useState<SurveyAnalytics | null>(null)
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [surveyError, setSurveyError] = useState('')
  // restricted (403) and period (400) are final answers, so only 'retry' offers Retry.
  const [surveyErrorKind, setSurveyErrorKind] = useState<SurveyErrorKind>('retry')
  const [surveyLoadAttempt, setSurveyLoadAttempt] = useState(0)

  // Paired pre/post survey improvement. Requires a complete period, same as the API contract.
  useEffect(() => {
    if (!projectId || !surveyPeriod || surveyUnavailable || analysisView !== 'survey') {
      setSurveyLoading(false)
      setSurvey(null)
      setSurveyError('')
      setSurveyErrorKind('retry')
      return
    }
    void surveyLoadAttempt
    let active = true
    setSurveyLoading(true)
    setSurvey(null)
    setSurveyError('')
    setSurveyErrorKind('retry')
    analyticsClient
      .getSurveyAnalytics({
        projectId,
        periodStart: surveyPeriod.start,
        periodEnd: surveyPeriod.end,
      })
      .then((result) => {
        if (active) setSurvey(result)
      })
      .catch((caught: unknown) => {
        if (!active) return
        const kind = surveyErrorKindFor(caught)
        setSurveyErrorKind(kind)
        setSurveyError(
          kind === 'restricted'
            ? SURVEY_RESTRICTED_MESSAGE
            : kind === 'period'
              ? surveyFrozenOnly
                ? SURVEY_CLOSED_PERIOD_MESSAGE
                : SURVEY_PERIOD_MESSAGE
              : caught instanceof Error
                ? caught.message
                : 'Survey analytics could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setSurveyLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    analysisView,
    surveyUnavailable,
    surveyFrozenOnly,
    projectId,
    surveyPeriod,
    surveyLoadAttempt,
  ])

  return {
    resetSurvey: () => {
      setSurvey(null)
      setSurveyError('')
      setSurveyErrorKind('retry')
    },
    retrySurvey: () => setSurveyLoadAttempt((value) => value + 1),
    survey,
    surveyError,
    surveyErrorKind,
    surveyLoading,
  }
}
