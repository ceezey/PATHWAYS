import { describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const clients = vi.hoisted(() => ({ indicators: vi.fn(), activities: vi.fn(), context: vi.fn() }))
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: { getProjectIndicators: clients.indicators },
}))
vi.mock('@/lib/api/activities', () => ({
  activitiesClient: { getActivities: clients.activities, getActivityContext: clients.context },
}))

import {
  useRuleBindingActivities,
  useRuleBindingActivityContext,
  useRuleBindingIndicators,
} from './rules.reads'

const projectId = 'a1000000-0000-4000-8000-00000000000b'

describe('rule binding reads', () => {
  it('keeps one resource key, scope and permission per bound record kind', () => {
    useRuleBindingIndicators(projectId, true)
    useRuleBindingActivities(projectId, false)
    useRuleBindingActivityContext(null, true)
    expect(
      read.mock.calls.map(([key, scope, permission, , enabled]) => [
        key,
        scope,
        permission,
        enabled,
      ]),
    ).toEqual([
      ['rule-binding-indicators', projectId, 'indicators.read', true],
      ['rule-binding-activities', projectId, 'activities.read', false],
      ['rule-binding-activities-context', null, 'activities.context.read', true],
    ])
  })

  it('fetches each kind from its own client method with the scope project and the signal', () => {
    read.mockClear()
    useRuleBindingIndicators(projectId, true)
    useRuleBindingActivities(projectId, true)
    useRuleBindingActivityContext(null, true)
    const signal = new AbortController().signal
    for (const call of read.mock.calls) call[3](signal)
    expect(clients.indicators.mock.calls).toEqual([[projectId, signal]])
    expect(clients.activities.mock.calls).toEqual([[projectId, signal]])
    expect(clients.context.mock.calls).toEqual([['', signal]])
  })
})
