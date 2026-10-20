import { describe, expect, it } from 'vitest'

import { analysisViews, sectionLabels, visualizationTypes } from './analytics.copy'

describe('analytics copy', () => {
  it('names the four analysis views by value and label', () => {
    expect(analysisViews.map(({ value, label }) => [value, label])).toEqual([
      ['kpi', 'KPI / indicator performance'],
      ['participation', 'Participation patterns'],
      ['survey', 'Survey improvement'],
      ['timeline', 'Project / activity timeline adherence'],
    ])
  })

  it('names the four visualization types by value and label', () => {
    expect(visualizationTypes.map(({ value, label }) => [value, label])).toEqual([
      ['bar', 'Bar chart'],
      ['line', 'Line chart'],
      ['table', 'Table'],
      ['map', 'Map'],
    ])
  })

  it('labels the five descriptive sections', () => {
    expect(sectionLabels).toEqual({
      ACTIVITY_STATE: 'Activity state',
      MILESTONE_STATE: 'Milestone state',
      SADDD_SEX: 'Sex',
      SADDD_AGE: 'Age band',
      SADDD_DISABILITY: 'Disability',
    })
  })
})
