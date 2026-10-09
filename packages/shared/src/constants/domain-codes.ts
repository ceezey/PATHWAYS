// Form types that accept direct entry submissions (V4-C11).
export const DIRECT_ENTRY_FORM_TYPES = [
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'ACTIVITY_MONITORING',
] as const

// Categories a project team may record for an overdue activity.
export const overdueExplanationCategories = [
  'WEATHER',
  'SECURITY',
  'FUNDING',
  'COMMUNITY',
  'LOGISTICS',
  'OTHER',
] as const
export type OverdueExplanationCategory = (typeof overdueExplanationCategories)[number]

// Report kind codes the api accepts for preview and generation.
export const reportKinds = [
  'PROJECT_SUMMARY',
  'INDICATOR_SUMMARY',
  'BENEFICIARY_SUMMARY',
  'SURVEY_FORM_RESULTS',
  'MONITORING_REPORT',
  'EVALUATION_REPORT',
] as const
export type ReportKindCode = (typeof reportKinds)[number]
