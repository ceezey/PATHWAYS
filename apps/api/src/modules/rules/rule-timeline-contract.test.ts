import { dryRunInputSchema, dryRunOutputSchema, timelineObservation } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { evaluateRule } from './rule-engine'

const scope = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  projectId: '20000000-0000-4000-8000-000000000001',
}
const asOf = '2026-09-27T04:00:00.000Z'
const condition = {
  kind: 'CONDITION' as const,
  id: 'remaining',
  metric: 'PROJECT_REMAINING_DAYS' as const,
  operator: 'LT' as const,
  threshold: '0',
}

describe('timeline evaluation contract', () => {
  it.each(['PLANNED', 'COMPLETED'] as const)(
    'evaluates %s timeline observations into evidence the dry run output schema accepts',
    (projectStatus) => {
      const observation = timelineObservation({
        scope,
        conditionId: condition.id,
        metric: condition.metric,
        asOf,
        reportingDate: '2026-09-27',
        projectStatus,
        projectArchived: false,
        revision: 'entered-test-values',
        startDate: '2026-09-01',
        endDate: '2026-09-25',
      })
      const input = dryRunInputSchema.parse({
        rule: {
          ...scope,
          ruleId: '30000000-0000-4000-8000-000000000001',
          version: 1,
          name: 'Entered schedule',
          severity: null,
          conditions: condition,
          recommendations: [
            {
              id: '40000000-0000-4000-8000-000000000001',
              title: 'Review schedule',
              text: 'Review schedule.',
            },
          ],
        },
        asOf,
        observations: [observation],
      })
      const result = evaluateRule(input)
      expect(result.result).toBe(projectStatus === 'PLANNED' ? 'TRUE' : 'UNAVAILABLE')
      expect(dryRunOutputSchema.safeParse({ ...result, severityBasis: null }).success).toBe(true)
    },
  )
})
