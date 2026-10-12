// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { SurveyAggregateResultSet, SurveyFormDefinition } from '@/types/pathways'

import { SurveyReportOverview } from './survey-report-overview'

const form: SurveyFormDefinition = {
  id: 'form-a',
  title: 'Training feedback',
  formType: 'Training Survey',
  programName: 'Program A',
  projectId: 'project-a',
  fields: [],
}
const result: SurveyAggregateResultSet = {
  id: 'result-a',
  formId: 'form-a',
  projectId: 'project-a',
  location: 'Area A',
  responseDate: '2026-01-05',
  reportingPeriod: 'Q1 2026',
  responseCount: 4,
  questionResults: [],
  demographicBreakdowns: [],
}

afterEach(cleanup)

describe('SurveyReportOverview', () => {
  it('shows the exact response date as a medium UTC calendar day', () => {
    render(<SurveyReportOverview form={form} result={result} />)
    expect(screen.getByText('Jan 5, 2026')).toBeTruthy()
  })
})
