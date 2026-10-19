import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDashboardActionCounts } from './dashboard.reads'

const reads = vi.hoisted(() => ({ read: vi.fn(), counts: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: reads.read }))
vi.mock('@/lib/api/dashboards', () => ({
  dashboardsClient: { getDashboardActionCounts: reads.counts },
}))

describe('useDashboardActionCounts', () => {
  beforeEach(() => {
    reads.read.mockReset().mockReturnValue('read result')
    reads.counts.mockReset()
  })

  it('reads the shared key for the projects grant, with no project and no options', () => {
    useDashboardActionCounts()

    expect(reads.read).toHaveBeenCalledTimes(1)
    const args = reads.read.mock.calls[0]
    expect(args.slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])
    expect(args).toHaveLength(5)
  })

  it('is enabled unless the caller says otherwise', () => {
    useDashboardActionCounts()

    expect(reads.read.mock.calls[0][4]).toBe(true)
  })

  it.each([true, false])('passes the enabled flag %s on', (enabled) => {
    useDashboardActionCounts(enabled)

    expect(reads.read.mock.calls[0][4]).toBe(enabled)
  })

  it('reads through the dashboards client without arguments', async () => {
    reads.counts.mockResolvedValue({ forReview: 2 })
    useDashboardActionCounts()

    await expect(reads.read.mock.calls[0][3]()).resolves.toEqual({ forReview: 2 })
    expect(reads.counts).toHaveBeenCalledWith()
  })

  it('returns the read as it is', () => {
    expect(useDashboardActionCounts()).toBe('read result')
  })
})
