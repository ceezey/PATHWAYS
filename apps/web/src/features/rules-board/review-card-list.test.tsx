/* @vitest-environment jsdom */
import type { HumanAlert, HumanRecommendation } from '@/features/analytics/rules-human-contract'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewCardList, statusLabel } from './review-card-list'

const id = (n: number) => `30000000-0000-4000-8000-00000000000${n}`
const alert = (lifecycle: HumanAlert['lifecycle']): HumanAlert =>
  ({
    id: id(1),
    projectId: id(2),
    title: 'Budget depletion risk',
    explanation: 'Spending is ahead of progress.',
    severity: 'HIGH',
    lifecycle,
    evidence: [
      {
        conditionId: 'c1',
        metric: 'INDICATOR_PROGRESS_PERCENT',
        operator: 'LT',
        threshold: '70',
        thresholdMaximum: null,
        cell: { state: 'AVAILABLE', value: '55', reason: null },
        unit: '%',
        result: 'TRUE',
      },
    ],
  }) as unknown as HumanAlert
const recommendation = {
  id: id(3),
  projectId: id(2),
  title: 'Review plan',
  basis: 'the linked budget alert',
  status: 'NEW',
} as unknown as HumanRecommendation

afterEach(cleanup)
describe('ReviewCardList', () => {
  it('renders alert cards with severity and basis line as one clickable card', () => {
    const onSelect = vi.fn()
    render(
      <ReviewCardList
        items={[alert('AUTO_RESOLVED')]}
        selectedId={null}
        onSelect={onSelect}
        projectLabel={() => 'ACT-001'}
      />,
    )
    expect(screen.getByText('Budget depletion risk — ACT-001')).toBeTruthy()
    expect(screen.getByText('Current indicator progress 55% vs threshold 70%')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('Auto-resolved')).toBeTruthy()
    expect(document.querySelector('[data-card-kind="alert"]')?.className).toContain('danger-subtle')
    fireEvent.click(screen.getByRole('button', { name: 'Review Budget depletion risk' }))
    expect(onSelect).toHaveBeenCalledWith(id(1))
  })
  it('renders recommendation cards with warning surface and no severity', () => {
    render(<ReviewCardList items={[recommendation]} selectedId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Based on the linked budget alert')).toBeTruthy()
    expect(document.querySelector('[data-card-kind="recommendation"]')?.className).toContain(
      'warning-subtle',
    )
    expect(screen.queryByText('High')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
  it('selects a recommendation by clicking anywhere on its card', () => {
    const onSelect = vi.fn()
    render(<ReviewCardList items={[recommendation]} selectedId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Based on the linked budget alert'))
    expect(onSelect).toHaveBeenCalledWith(id(3))
  })
  it('labels statuses and never uses Accepted or Rejected', () => {
    const labels = ['NEW', 'REVIEWED', 'ACTIONED', 'RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'].map(
      statusLabel,
    )
    expect(labels).toEqual([
      'New',
      'Reviewed',
      'Actioned',
      'Resolved',
      'Dismissed',
      'Auto-resolved',
    ])
    expect(statusLabel('SOMETHING_ELSE')).toBe('Something else')
    expect(labels.join(' ')).not.toMatch(/Accepted|Rejected/)
  })
})
