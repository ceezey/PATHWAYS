import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HumanReviewAction } from './human-review-action'
import type { HumanAlert, HumanRecommendation } from './rules-human-contract'
const state = vi.hoisted(() => ({
  permissions: [
    'recommendations.review',
    'recommendations.outcome.record',
    'alerts.outcome.record',
  ],
  subject: 'synthetic-a',
  review: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  committed: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: state.subject,
      userId: state.subject,
      organizationId: 'synthetic-org',
      roles: ['PROJECT_MANAGER'],
      assignedProjectIds: ['20000000-0000-4000-8000-000000000001'],
      permissions: state.permissions,
    },
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: {
    reviewRecommendation: state.review,
    previewRecommendation: state.preview,
    confirmRecommendation: state.confirm,
  },
}))
const id = '10000000-0000-4000-8000-000000000001'
const record: HumanRecommendation = {
  id,
  projectId: '20000000-0000-4000-8000-000000000001',
  alertId: '30000000-0000-4000-8000-000000000001',
  ruleId: '40000000-0000-4000-8000-000000000001',
  title: 'Synthetic recommendation',
  text: 'Review activity scheduling.',
  basis: 'Recorded overdue condition.',
  status: 'NEW',
  revision: '7',
  proposedAt: '2026-09-27T01:00:00Z',
  reviewedAt: null,
}
const linked: HumanAlert = {
  id: record.alertId,
  projectId: record.projectId,
  ruleId: record.ruleId,
  ruleVersion: 1,
  title: 'Linked alert',
  explanation: 'Recorded source.',
  severity: 'LOW',
  lifecycle: 'AUTO_RESOLVED',
  revision: '9',
  evaluatedAt: '2026-09-27T01:00:00Z',
  freshness: 'CURRENT',
  conditions: {
    kind: 'CONDITION',
    id: 'days',
    metric: 'PROJECT_REMAINING_DAYS',
    operator: 'LT',
    threshold: '0',
  },
  evidence: [
    {
      conditionId: 'days',
      metric: 'PROJECT_REMAINING_DAYS',
      operator: 'LT',
      threshold: '0',
      thresholdMaximum: null,
      cell: { state: 'AVAILABLE', value: '-1', reason: null },
      unit: 'days',
      result: 'TRUE',
    },
  ],
  asOf: '2026-09-27T01:00:00Z',
  reportingDate: '2026-09-27',
  calendar: { zone: 'Asia/Manila', version: '1' },
  predefinedRecommendations: [
    { id: record.id, title: 'Review schedule', text: 'Review schedule.' },
  ],
  linkedRecommendationIds: [record.id],
}
const preview = {
  previewId: id,
  expiresAt: '2099-01-01T00:00:00Z',
  operationKind: 'RECOMMENDATION_OUTCOME',
  alertRevision: null,
  recommendationRevision: '7',
  outcome: 'DECLINE',
  message: 'The decision will be recorded.',
  recipientCount: 2,
}
const props = {
  kind: 'recommendation' as const,
  item: record,
  mode: 'outcome' as const,
  onCommitted: state.committed,
  onCancel: () => {},
}
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.subject = 'synthetic-a'
  state.permissions = [
    'recommendations.review',
    'recommendations.outcome.record',
    'alerts.outcome.record',
  ]
  state.preview.mockResolvedValue(preview)
  state.confirm.mockResolvedValue({
    recommendationId: id,
    alertId: record.alertId,
    outcome: 'DECLINE',
  })
  state.review.mockResolvedValue(record)
})
const enter = () => {
  fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'DECLINE' } })
  fireEvent.change(screen.getByLabelText('Decision note'), {
    target: { value: 'Private explanation' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview outcome' }))
}
describe('owned human decision flow', () => {
  it('requires explicit preview confirmation and never includes the note in confirmation', async () => {
    render(<HumanReviewAction {...props} />)
    enter()
    await screen.findByText('2 recipients will receive an in-app notification.')
    expect(state.confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and record outcome' }))
    await waitFor(() => expect(state.committed).toHaveBeenCalledOnce())
    expect(state.preview.mock.calls[0][1]).toMatchObject({
      expectedRevision: '7',
      note: 'Private explanation',
      outcome: 'DECLINE',
    })
    expect(state.confirm.mock.calls[0][1]).toEqual({
      previewId: id,
      clientOperationId: expect.any(String),
    })
  })
  it('retries an uncertain confirmation with the identical operation identifier and preview', async () => {
    state.confirm.mockRejectedValueOnce(new Error('lost response'))
    render(<HumanReviewAction {...props} />)
    enter()
    await screen.findByRole('button', { name: 'Confirm and record outcome' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and record outcome' }))
    await screen.findByText(
      'A response was not confirmed. Retry this same confirmation or reload the record.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and record outcome' }))
    await waitFor(() => expect(state.committed).toHaveBeenCalledOnce())
    expect(state.confirm.mock.calls[1][1]).toEqual(state.confirm.mock.calls[0][1])
  })
  it('discards an old preview on logout and return to the same account', async () => {
    let finish: (value: typeof preview) => void = () => {}
    state.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<HumanReviewAction {...props} />)
    enter()
    await waitFor(() => expect(state.preview).toHaveBeenCalledOnce())
    await act(async () => clearSensitiveDraftStorage())
    await act(async () => finish(preview))
    expect(screen.queryByText('Confirm outcome')).toBeNull()
    expect((screen.getByLabelText('Decision note') as HTMLTextAreaElement).value).toBe('')
    expect(state.confirm).not.toHaveBeenCalled()
  })
  it('does not apply a mutation result after permission loss or unmount', async () => {
    let finish: (value: typeof record) => void = () => {}
    state.review.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<HumanReviewAction {...props} mode="review" />)
    fireEvent.change(screen.getByLabelText('Decision note'), {
      target: { value: 'Private explanation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    await waitFor(() => expect(state.review).toHaveBeenCalledOnce())
    state.permissions = []
    view.rerender(<HumanReviewAction {...props} mode="review" />)
    view.unmount()
    await act(async () => finish(record))
    expect(state.committed).not.toHaveBeenCalled()
  })
  it('rejects a contradictory preview operation kind before allowing confirmation', async () => {
    state.preview.mockResolvedValueOnce({ ...preview, operationKind: 'ALERT_OUTCOME' })
    render(<HumanReviewAction {...props} />)
    enter()
    await screen.findByText(
      'A response was not confirmed. Retry this same request or reload the record.',
    )
    expect(screen.queryByText('Confirm outcome')).toBeNull()
    expect(state.confirm).not.toHaveBeenCalled()
  })
  it('binds ACCEPT to both record revisions even when the linked alert is terminal', async () => {
    state.preview.mockResolvedValueOnce({
      ...preview,
      outcome: 'ACCEPT',
      operationKind: 'COMBINED_OUTCOME',
      alertRevision: '9',
    })
    render(<HumanReviewAction {...props} linkedAlert={linked} />)
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'ACCEPT' } })
    fireEvent.change(screen.getByLabelText('Decision note'), {
      target: { value: 'Private acceptance reason' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview outcome' }))
    await screen.findByText('Confirm outcome')
    expect(state.preview.mock.calls[0][1]).toMatchObject({
      expectedRevision: '7',
      expectedAlertRevision: '9',
      outcome: 'ACCEPT',
    })
  })
  it('rejects a preview that changed the linked alert revision', async () => {
    state.preview.mockResolvedValueOnce({
      ...preview,
      outcome: 'ACCEPT',
      operationKind: 'COMBINED_OUTCOME',
      alertRevision: '10',
    })
    render(<HumanReviewAction {...props} linkedAlert={linked} />)
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'ACCEPT' } })
    fireEvent.change(screen.getByLabelText('Decision note'), {
      target: { value: 'Private acceptance reason' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview outcome' }))
    await screen.findByText(
      'A response was not confirmed. Retry this same request or reload the record.',
    )
    expect(screen.queryByText('Confirm outcome')).toBeNull()
    expect(state.confirm).not.toHaveBeenCalled()
  })
  it('does not permit ACCEPT without the linked alert write set and revision', () => {
    render(<HumanReviewAction {...props} />)
    expect((screen.getByRole('option', { name: 'ACCEPT' }) as HTMLOptionElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole('option', { name: 'PARTIALLY ACCEPT' }) as HTMLOptionElement).disabled,
    ).toBe(true)
  })
})
