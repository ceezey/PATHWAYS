import type { metricRecipes } from '@pathways/shared'

export const recipeNames: Record<(typeof metricRecipes)[number], string> = {
  PARTICIPATION_RECORD_COUNT: 'Committed participation records',
  DISTINCT_ATTENDING_INDIVIDUALS: 'Distinct attending individuals',
  ATTENDANCE_RECORDS_PER_INDIVIDUAL: 'Attendance records per individual',
  EFFECTIVE_JOURNEY_EVENT_COUNT: 'Effective journey events',
  FORM_NUMERIC_SUM: 'Validated form numeric sum',
  FORM_NUMERIC_AVERAGE: 'Validated form numeric average',
  ACTIVITY_COMPLETION_PERCENTAGE: 'Activity completion percentage',
}
