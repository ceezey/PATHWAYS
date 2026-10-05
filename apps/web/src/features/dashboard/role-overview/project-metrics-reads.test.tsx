/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
vi.mock('@/features/projects/use-project-reads', () => ({ useProjectOverviewMetricsRead: read }))

import type { PathwaysRole } from '@/types/pathways-role'
import { useProjectMetrics } from './project-metrics-reads'

const overview = {
  kpiAchievement: { metric: { value: '0.5' } },
  budgetUtilization: { approvedBudget: '1000.00', countableSpending: '250.00' },
}
const Probe = ({ viewer }: { viewer: PathwaysRole }) => {
  const { metrics, reads } = useProjectMetrics([{ id: 'p1' }, { id: 'p2' }], viewer)
  return (
    <>
      {reads}
      <output>{JSON.stringify(metrics)}</output>
    </>
  )
}

describe('useProjectMetrics', () => {
  afterEach(() => {
    cleanup()
    read.mockReset()
  })
  it('reads each project through the cached overview metrics read', () => {
    read.mockImplementation((id: string) => ({ data: id === 'p1' ? overview : undefined }))
    render(<Probe viewer="Project Manager" />)
    expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['p1', 'p2']))
    const metrics = JSON.parse(screen.getByRole('status').textContent ?? '{}')
    expect(metrics.p1.budget).toEqual({ percent: 25, allocated: '1000.00', used: '250.00' })
    expect(metrics.p2).toBeUndefined()
  })
  it('makes no metrics reads for roles without project metrics', () => {
    render(<Probe viewer="Project Officer" />)
    expect(read).not.toHaveBeenCalled()
  })
})
