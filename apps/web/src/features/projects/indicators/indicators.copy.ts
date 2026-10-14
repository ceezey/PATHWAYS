import { indicatorTypes, type metricRecipes, type numericKinds } from '@pathways/shared'

export const recipeNames: Record<(typeof metricRecipes)[number], string> = {
  PARTICIPATION_RECORD_COUNT: 'Committed participation records',
  DISTINCT_ATTENDING_INDIVIDUALS: 'Distinct attending individuals',
  ATTENDANCE_RECORDS_PER_INDIVIDUAL: 'Attendance records per individual',
  EFFECTIVE_JOURNEY_EVENT_COUNT: 'Effective journey events',
  FORM_NUMERIC_SUM: 'Validated form numeric sum',
  FORM_NUMERIC_AVERAGE: 'Validated form numeric average',
  ACTIVITY_COMPLETION_PERCENTAGE: 'Activity completion percentage',
}

export const typeLabel = (value = 'OUTPUT') =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
export const typeOptions = indicatorTypes.map((value) => ({ value, label: typeLabel(value) }))

export type Recipe = (typeof metricRecipes)[number]

// Only recipes the database computes today; the rest return no value (see deferred-features.md).
export const enabledRecipes: Recipe[] = ['ACTIVITY_COMPLETION_PERCENTAGE']
export const enabledRecipeOptions = enabledRecipes.map((value) => ({
  value,
  label: recipeNames[value],
}))

// Hidden contract values per recipe; the database requires these numeric domains for each recipe.
export const recipeContract: Record<Recipe, { kind: (typeof numericKinds)[number]; unit: string }> =
  {
    ACTIVITY_COMPLETION_PERCENTAGE: { kind: 'PERCENTAGE', unit: '%' },
    PARTICIPATION_RECORD_COUNT: { kind: 'COUNT', unit: 'records' },
    DISTINCT_ATTENDING_INDIVIDUALS: { kind: 'COUNT', unit: 'people' },
    EFFECTIVE_JOURNEY_EVENT_COUNT: { kind: 'COUNT', unit: 'events' },
    ATTENDANCE_RECORDS_PER_INDIVIDUAL: { kind: 'RATIO', unit: 'records per person' },
    FORM_NUMERIC_SUM: { kind: 'NON_NEGATIVE', unit: 'value' },
    FORM_NUMERIC_AVERAGE: { kind: 'NON_NEGATIVE', unit: 'value' },
  }

// Suggested type per recipe; picking a recipe preselects it and the type stays editable.
export const recipeTypes: Partial<Record<Recipe, (typeof indicatorTypes)[number]>> = {
  ACTIVITY_COMPLETION_PERCENTAGE: 'ACTIVITY',
  PARTICIPATION_RECORD_COUNT: 'PARTICIPATION',
  DISTINCT_ATTENDING_INDIVIDUALS: 'PARTICIPATION',
  ATTENDANCE_RECORDS_PER_INDIVIDUAL: 'PARTICIPATION',
  FORM_NUMERIC_SUM: 'OUTPUT',
  FORM_NUMERIC_AVERAGE: 'OUTPUT',
}
// Suggested starting target per recipe; the target stays editable for every recipe.
export const recipeTargets: Partial<Record<Recipe, string>> = {
  ACTIVITY_COMPLETION_PERCENTAGE: '100',
}
