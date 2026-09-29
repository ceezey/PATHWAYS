import { describe, expect, it } from 'vitest'
import { metricObservationSchema as serverObservationSchema } from '../../../../api/src/modules/rules/rule-contract'
import { evaluateRule } from '../../../../api/src/modules/rules/rule-engine'
import { timelineObservation } from './rule-test-metrics'
import { dryRunInputSchema, dryRunOutputSchema } from './rules-human-contract'

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

describe('browser and server timeline evaluation contract', () => {
  it.each(['PLANNED', 'COMPLETED'] as const)(
    'accepts browser-generated %s observations on the server and server evidence in the browser',
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
      expect(serverObservationSchema.safeParse(observation).success).toBe(true)
      const input = dryRunInputSchema.parse({
        rule: {
          ...scope,
          ruleId: '30000000-0000-4000-8000-000000000001',
          version: 1,
          name: 'Entered schedule',
          severity: 'LOW',
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
      expect(dryRunOutputSchema.safeParse(result).success).toBe(true)
    },
  )
})
