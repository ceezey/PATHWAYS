/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { resetDemo, switchDemoAccount } from '@/lib/demo-state/store'
import { MockPathwaysClient } from './mock-pathways-client'

afterEach(() => window.localStorage.clear())

describe('MockPathwaysClient budget allocation', () => {
  it('stores only the planned-allocation override and leaves actual spending unchanged', async () => {
    resetDemo()
    switchDemoAccount('project-manager')
    const client = new MockPathwaysClient()
    const initial = (await client.getBudgets('futuremakers-ncr'))[0]
    const updated = await client.updateBudgetAllocation({
      plannedAmount: 4_500_000,
      projectId: 'futuremakers-ncr',
    })

    expect(updated).toMatchObject({
      actualSpending: initial?.actualSpending,
      plannedAmount: 4_500_000,
    })
    expect((await client.getBudgets('futuremakers-ncr'))[0]?.plannedAmount).toBe(4_500_000)
    await expect(client.getBudgets('futuremakers-ncr')).resolves.toEqual([
      expect.objectContaining({
        actualSpending: initial?.actualSpending,
        plannedAmount: 4_500_000,
      }),
    ])
  })

  it('ignores malformed stored overrides and rejects invalid or unknown updates', async () => {
    resetDemo()
    switchDemoAccount('project-manager')
    const client = new MockPathwaysClient()
    window.localStorage.setItem(
      'pathways.prototypeBudgets',
      JSON.stringify([{ plannedAmount: 'invalid', projectId: 'futuremakers-ncr' }]),
    )

    await expect(client.getBudgets('futuremakers-ncr')).resolves.toEqual([
      expect.objectContaining({ plannedAmount: 4_200_000 }),
    ])
    await expect(
      client.updateBudgetAllocation({ plannedAmount: 1.5, projectId: 'futuremakers-ncr' }),
    ).rejects.toThrow('cover verified spending')
    await expect(
      client.updateBudgetAllocation({ plannedAmount: 1_000, projectId: 'unknown-project' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
