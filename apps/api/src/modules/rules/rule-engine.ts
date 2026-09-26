import { scaledDecimal } from '@pathways/shared'
import { z } from 'zod'
import {
  MAX_CONDITIONS,
  type MetricObservation,
  RULE_CONTRACT_VERSION,
  type RuleCondition,
  type RuleDefinition,
  type RuleNode,
  metricObservationSchema,
  ruleDefinitionSchema,
} from './rule-contract'

export type EvaluationResult = 'TRUE' | 'FALSE' | 'UNAVAILABLE'
export type ConditionEvidence = {
  condition: RuleCondition
  observation: MetricObservation | null
  result: EvaluationResult
  reason: 'NO_OBSERVATION' | null
}
export type GroupEvidence = {
  kind: 'GROUP'
  mode: 'AND' | 'OR'
  result: EvaluationResult
  children: EvaluationEvidence[]
}
export type EvaluationEvidence = ConditionEvidence | GroupEvidence
export type RuleEvaluation = {
  contractVersion: typeof RULE_CONTRACT_VERSION
  rule: RuleDefinition
  asOf: string
  result: EvaluationResult
  evidence: EvaluationEvidence
}

const evaluationInputSchema = z
  .object({
    rule: ruleDefinitionSchema,
    asOf: z.string().datetime({ offset: true }),
    observations: z.array(metricObservationSchema).max(MAX_CONDITIONS),
  })
  .strict()

function compare(condition: RuleCondition, value: string): EvaluationResult {
  const actual = scaledDecimal(value)
  const threshold = scaledDecimal(condition.threshold)
  let passed: boolean
  switch (condition.operator) {
    case 'LT':
      passed = actual < threshold
      break
    case 'LTE':
      passed = actual <= threshold
      break
    case 'EQ':
      passed = actual === threshold
      break
    case 'GTE':
      passed = actual >= threshold
      break
    case 'GT':
      passed = actual > threshold
      break
    case 'BETWEEN':
      passed = actual >= threshold && actual <= scaledDecimal(condition.thresholdMaximum ?? '')
      break
  }
  return passed ? 'TRUE' : 'FALSE'
}

/** Trusted providers must retrieve authorized source scope before constructing this input. */
export function evaluateRule(input: unknown): RuleEvaluation {
  const parsed = evaluationInputSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid scoped evaluation input.')
  const { rule, asOf, observations } = parsed.data
  const byId = new Map<string, MetricObservation>()
  const conditions = new Map<string, RuleCondition>()
  const sources = new Map<string, string>()
  function collect(node: RuleNode) {
    if (node.kind === 'CONDITION') conditions.set(node.id, node)
    else for (const child of node.children) collect(child)
  }
  collect(rule.conditions)
  for (const observation of observations) {
    const condition = conditions.get(observation.conditionId)
    if (
      !condition ||
      byId.has(observation.conditionId) ||
      observation.organizationId !== rule.organizationId ||
      observation.projectId !== rule.projectId ||
      observation.metric !== condition.metric ||
      observation.indicatorId !== condition.indicatorId ||
      observation.activityId !== condition.activityId ||
      Date.parse(observation.asOf) !== Date.parse(asOf)
    )
      throw new Error('Observation scope, binding or reporting time does not match the rule.')
    if (observation.source) {
      const source = observation.source
      const expectedKinds = condition.metric.startsWith('INDICATOR_')
        ? ['MANUAL_INDICATOR', 'ACTIVITY_COMPLETION_INDICATOR']
        : condition.metric.startsWith('PROJECT_')
          ? ['PROJECT']
          : condition.metric === 'ACTIVITY_OVERDUE_DAYS'
            ? ['ACTIVITY']
            : ['ACTIVITY_POPULATION']
      const expectedId = condition.indicatorId ?? condition.activityId ?? rule.projectId
      if (!expectedKinds.includes(source.kind) || source.recordId !== expectedId)
        throw new Error('Observation source does not match the approved metric binding.')
      const family = condition.metric.startsWith('INDICATOR_')
        ? 'INDICATOR'
        : condition.metric.startsWith('PROJECT_')
          ? 'PROJECT'
          : condition.metric === 'ACTIVITY_OVERDUE_DAYS'
            ? 'ACTIVITY'
            : 'ACTIVITY_POPULATION'
      const key = `${family}/${source.recordId}`
      const signature = JSON.stringify({
        kind: source.kind,
        revision: source.revision,
        calculation: observation.calculation,
      })
      const previous = sources.get(key)
      if (previous !== undefined && previous !== signature)
        throw new Error(
          'Conditions must use a consistent source revision and calculation snapshot.',
        )
      sources.set(key, signature)
    }
    byId.set(observation.conditionId, observation)
  }
  function evaluate(node: RuleNode): EvaluationEvidence {
    if (node.kind === 'CONDITION') {
      const observation = byId.get(node.id) ?? null
      return {
        condition: node,
        observation,
        result:
          observation?.cell.value === null || observation === null
            ? 'UNAVAILABLE'
            : compare(node, observation.cell.value),
        reason: observation === null ? 'NO_OBSERVATION' : null,
      }
    }
    // All leaves retain evidence; no short-circuit may drop a condition's result.
    const children = node.children.map(evaluate)
    const values = children.map((child) => child.result)
    const decisive = node.mode === 'AND' ? 'FALSE' : 'TRUE'
    const result = values.includes(decisive)
      ? decisive
      : values.includes('UNAVAILABLE')
        ? 'UNAVAILABLE'
        : node.mode === 'AND'
          ? 'TRUE'
          : 'FALSE'
    return { kind: 'GROUP', mode: node.mode, result, children }
  }
  const evidence = evaluate(rule.conditions)
  return { contractVersion: RULE_CONTRACT_VERSION, rule, asOf, result: evidence.result, evidence }
}
