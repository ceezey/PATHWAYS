import { CALCULATED_RULE_KINDS, type FieldIntakeRule } from '@pathways/shared'
import { answerResolver } from '../answers'
import type { SmartMatchDecision, SmartMatchField } from './smart-match'
import { choiceParts, isBlank, sampleText } from './smart-match-values'

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

const isCalculated = (field: CoverageField) =>
  field.rule != null && (CALCULATED_RULE_KINDS as readonly string[]).includes(field.rule.kind)

/**
 * COVERED when every column is mapped or ignored, every answer of a mapped choice
 * column resolves, and every required field has a column, a default or a rule.
 * Distinct values are keyed by source key; counts only, never the values.
 */
export function importCoverage(input: {
  decisions: readonly SmartMatchDecision[]
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
    mapped.add(field.id)
    if (field.dataType !== 'SELECT' && field.dataType !== 'MULTIPLE_SELECT') continue
    let resolve = resolvers.get(field.id)
    if (!resolve) {
      resolve = answerResolver(field.allowedValues ?? [], field.valueAliases ?? [])
      resolvers.set(field.id, resolve)
    }
    for (const value of input.distinctValues[decision.sourceKey] ?? []) {
      if (isBlank(value)) continue
      const parts = field.dataType === 'SELECT' ? [sampleText(value)] : choiceParts(value)
      if (!parts || parts.some((part) => part === null || resolve(part) === null))
        unresolvedValues++
    }
  }
  const requiredUncovered = input.fields.filter(
    (field) =>
      field.required && !mapped.has(field.id) && !field.importDefault && !isCalculated(field),
  ).length
  return {
    coverage:
      uncoveredColumns + unresolvedValues + requiredUncovered === 0 ? 'COVERED' : 'NOT_COVERED',
    uncoveredColumns,
    unresolvedValues,
    requiredUncovered,
  }
}
