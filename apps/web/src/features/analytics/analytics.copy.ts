import type { DescriptiveAnalytics } from '@pathways/shared'

export const analysisViews = [
  { value: 'kpi', label: 'KPI / indicator performance' },
  { value: 'participation', label: 'Participation patterns' },
  { value: 'survey', label: 'Survey improvement' },
  { value: 'timeline', label: 'Project / activity timeline adherence' },
] as const
export const visualizationTypes = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
  { value: 'table', label: 'Table' },
  { value: 'map', label: 'Map' },
] as const
export type AnalysisView = (typeof analysisViews)[number]['value']
export type VisualizationType = (typeof visualizationTypes)[number]['value']

export type SurveyErrorKind = 'restricted' | 'period' | 'retry'
export const SURVEY_RESTRICTED_MESSAGE = 'Survey improvement is restricted for your role.'
export const SURVEY_PERIOD_MESSAGE = 'This reporting period cannot be used for survey results.'
export const SURVEY_CLOSED_PERIOD_MESSAGE =
  'Survey results for your role are released after the reporting period closes. Choose a closed period.'
export const SURVEY_FROZEN_CAPTION =
  'Released once for this closed period; figures do not change on later views.'

export const exportFormats = ['CSV', 'XLS', 'XLSX', 'PDF'] as const
export type ExportFormat = (typeof exportFormats)[number]

export const activityFallbackLabel = 'Activity (name unavailable)'

export const sectionLabels: Record<
  DescriptiveAnalytics['distributions'][number]['section'],
  string
> = {
  ACTIVITY_STATE: 'Activity state',
  MILESTONE_STATE: 'Milestone state',
  SADDD_SEX: 'Sex',
  SADDD_AGE: 'Age band',
  SADDD_DISABILITY: 'Disability',
}
