import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({ budgets: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/finance', () => ({ financeClient: client }))

import { useBudgetsRead } from './budget.reads'

const signal = new AbortController().signal

describe('budget authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    client.budgets.mockReset()
  })

  it('reads the budget lines under one shared key, enabled unless the caller says otherwise', () => {
    useBudgetsRead('project-1')
    useBudgetsRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['finance-budgets', 'project-1', 'budgets.read'],
      ['finance-budgets', 'project-2', 'budgets.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toBeUndefined()
    read.mock.calls[0][3](signal)
    expect(client.budgets).toHaveBeenCalledWith('project-1', signal)
  })
})
