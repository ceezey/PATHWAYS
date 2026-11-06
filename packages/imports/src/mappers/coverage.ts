import type { FieldIntakeRule } from '@pathways/shared'
import { answerResolver } from '../answers'
import { deferredRequired, unsuppliedRequired } from '../validation/validate-rows'
import type { SmartMatchDecision, SmartMatchField } from './smart-match'
import { choiceAnswers } from './smart-match-values'

export type CoverageField = SmartMatchField & {
  required: boolean
  importDefault?: string | null
  rule?: FieldIntakeRule | null
}

export interface ImportCoverage {
  coverage: 'COVERED' | 'NOT_COVERED'
  uncoveredColumns: number
  unresolvedValues: number
  requiredUncovered: number
}

/** The answers normalization accepts: SELECT takes text or a boolean, MULTIPLE_SELECT what choiceAnswers reads. */
function answersOf(
  value: unknown,
  multiple: boolean,
  resolve: (raw: string) => string | null,
): string[] | null {
  if (multiple) return choiceAnswers(value, resolve)
  if (typeof value === 'string') return [value]
  return typeof value === 'boolean' ? [String(value)] : null
}

/**
 * COVERED when every column is mapped or ignored, every answer of a mapped choice
 * column resolves, and every required field has a column, a default or a rule, the deferred
 * registration fields excepted as validation does. Distinct values are keyed by source key; counts only.
 */
export function importCoverage(input: {
  formType: string
  decisions: readonly Pick<SmartMatchDecision, 'sourceKey' | 'status' | 'targetFieldId'>[]
  fields: readonly CoverageField[]
  distinctValues: Readonly<Record<string, readonly unknown[]>>
}): ImportCoverage {
  const fieldById = new Map(input.fields.map((field) => [field.id, field]))
  const resolvers = new Map<string, (raw: string) => string | null>()
  const mapped = new Set<string>()
  let uncoveredColumns = 0
  let unresolvedValues = 0
  for (const decision of input.decisions) {
    if (decision.status === 'PENDING') uncoveredColumns++
    const field = decision.targetFieldId ? fieldById.get(decision.targetFieldId) : undefined
    if (decision.status !== 'MAPPED' || !field) continue
    mapped.add(field.code)
    if (field.dataType !== 'SELECT' && field.dataType !== 'MULTIPLE_SELECT') continue
    let resolve = resolvers.get(field.id)
    if (!resolve) {
      resolve = answerResolver(field.allowedValues ?? [], field.valueAliases ?? [])
      resolvers.set(field.id, resolve)
    }
    for (const value of input.distinctValues[decision.sourceKey] ?? []) {
      if (value === null || value === undefined || value === '') continue
      const answers = answersOf(value, field.dataType === 'MULTIPLE_SELECT', resolve)
      if (!answers || answers.some((answer) => resolve(answer) === null)) unresolvedValues++
    }
  }
  const requiredUncovered = unsuppliedRequired(
    deferredRequired(input.formType, input.fields),
    mapped,
  ).length
  return {
    coverage:
      uncoveredColumns + unresolvedValues + requiredUncovered === 0 ? 'COVERED' : 'NOT_COVERED',
    uncoveredColumns,
    unresolvedValues,
    requiredUncovered,
  }
}
