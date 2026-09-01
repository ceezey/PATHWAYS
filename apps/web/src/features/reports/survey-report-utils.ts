import type {
  SurveyAggregateResultSet,
  SurveyFormDefinition,
  SurveyQuestionAggregate,
} from '@/types/pathways'

export type SurveyReportSelection = {
  formId: string
  location: string
  responseDate: string
}

export type SurveyReportRow = {
  question: string
  resultType: SurveyQuestionAggregate['kind']
  summary: string
  responses: number
}

const unique = (values: string[]) => [...new Set(values)]

export const getSurveyPrograms = (forms: SurveyFormDefinition[]) =>
  unique(forms.map((form) => form.programName))

export const getSurveyProjectIds = (forms: SurveyFormDefinition[], programName: string) =>
  unique(forms.filter((form) => form.programName === programName).map((form) => form.projectId))

export const getSurveyFormsForProject = (
  forms: SurveyFormDefinition[],
  programName: string,
  projectId: string,
) => forms.filter((form) => form.programName === programName && form.projectId === projectId)

export const getSurveyLocations = (results: SurveyAggregateResultSet[], formId: string) =>
  unique(results.filter((result) => result.formId === formId).map((result) => result.location))

export const getSurveyResponseDates = (
  results: SurveyAggregateResultSet[],
  formId: string,
  location: string,
) =>
  unique(
    results
      .filter((result) => result.formId === formId && result.location === location)
      .map((result) => result.responseDate),
  )

export const getFirstSurveySelection = (
  formId: string,
  results: SurveyAggregateResultSet[],
): SurveyReportSelection => {
  const firstResult = results.find((result) => result.formId === formId)

  return {
    formId,
    location: firstResult?.location ?? '',
    responseDate: firstResult?.responseDate ?? '',
  }
}

export const findSurveyResult = (
  results: SurveyAggregateResultSet[],
  selection: SurveyReportSelection,
) =>
  results.find(
    (result) =>
      result.formId === selection.formId &&
      result.location === selection.location &&
      result.responseDate === selection.responseDate,
  )

const categoricalSummary = (
  result: Extract<SurveyQuestionAggregate, { kind: 'Categorical distribution' }>,
) =>
  result.values
    .map((value) => {
      const percentage =
        result.responseCount > 0 ? Math.round((value.count / result.responseCount) * 100) : 0
      return `${value.label}: ${value.count} (${percentage}%)`
    })
    .join('; ')

const questionSummary = (result: SurveyQuestionAggregate) => {
  if (result.kind === 'Categorical distribution') {
    return categoricalSummary(result)
  }

  return `Average ${result.average} ${result.scaleLabel}; range ${result.minimum}-${result.maximum}`
}

export const buildSurveyReportRows = (
  form: SurveyFormDefinition | undefined,
  resultSet: SurveyAggregateResultSet | undefined,
): SurveyReportRow[] => {
  if (!form || !resultSet) return []

  return resultSet.questionResults.map((result) => ({
    question:
      form.fields.find((field) => field.id === result.fieldId)?.label ?? 'Unmapped question',
    resultType: result.kind,
    summary: questionSummary(result),
    responses: result.responseCount,
  }))
}
