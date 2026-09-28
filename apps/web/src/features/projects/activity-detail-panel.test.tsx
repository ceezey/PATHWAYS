/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

vi.mock('./activity-expense-dialog', () => ({ ActivityExpenseDialog: () => null }))
vi.mock('./activity-expense-review-dialog', () => ({ ActivityExpenseReviewDialog: () => null }))
vi.mock('./activity-proof-files', () => ({ ActivityProofFiles: () => null }))
vi.mock('./activity-proof-review-dialog', () => ({ ActivityProofReviewDialog: () => null }))

import { ActivityDetailContent } from './activity-detail-panel'

const activity: Activity = {
  id: 'a0908103-0597-4cbb-874f-61ad0d5e3f83',
  projectId: '0cd39c3f-b920-4823-bebf-8b32acf36236',
  title: 'Retained activity',
  description: 'Retained activity description.',
  storedStatus: 'NOT_STARTED',
  status: 'Planned',
  startDate: '2026-10-01',
  dueDate: '2026-10-02',
  assignedUserIds: [],
  assignedTo: [],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 41,
  beneficiariesReached: 2,
  budgetAllocation: 55678.9,
  budgetLogged: null,
  progress: 0,

  submittedProof: [],
  updateNotes: [],
  updatedAt: '2026-09-25T00:00:00.000Z',
}

describe('ActivityDetailContent server read model', () => {
  afterEach(cleanup)

  it('renders the aggregate and truthful optional states without fabricated values', () => {
    render(
      <ActivityDetailContent
        activity={activity}
        canDecideProof={false}
        canEdit={false}
        canLogExpense={false}
        canRequestExtension={false}
        canSubmitProof={false}
        canValidateExpense={false}
        canValidateProof={false}
        indicators={[]}
        journeyStages={[]}
        onActivityChanged={vi.fn()}
        onEdit={vi.fn()}
        onSubmitProof={vi.fn()}
      />,
    )

    expect(screen.getByText('2 of 41')).toBeTruthy()
    expect(screen.getByText('₱55,678.90')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.getByText('No journey stage linked')).toBeTruthy()
    expect(screen.getByText('No indicators are connected to this activity.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('NaN')
    expect(document.body.textContent).not.toContain('Project target comparison')
  })

  it('shows Request an extension as disabled with a Not available yet hint', () => {
    render(
      <ActivityDetailContent
        activity={activity}
        canDecideProof={false}
        canEdit={false}
        canLogExpense={false}
        canRequestExtension
        canSubmitProof={false}
        canValidateExpense={false}
        canValidateProof={false}
        indicators={[]}
        journeyStages={[]}
        onActivityChanged={vi.fn()}
        onEdit={vi.fn()}
        onSubmitProof={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Request an extension' })
    expect(button.hasAttribute('disabled')).toBe(true)
    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Not available yet')
  })

  it.each([
    [true, 'None yet'],
    [false, 'Unavailable'],
  ])(
    'labels a missing allocation for budget readers=%s as %s, never as zero',
    (canReadBudgets, label) => {
      render(
        <ActivityDetailContent
          activity={{ ...activity, budgetAllocation: null, budgetLogged: 12 }}
          canDecideProof={false}
          canEdit={false}
          canLogExpense={false}
          canReadBudgets={canReadBudgets}
          canRequestExtension={false}
          canSubmitProof={false}
          canValidateExpense={false}
          canValidateProof={false}
          indicators={[]}
          journeyStages={[]}
          onActivityChanged={vi.fn()}
          onEdit={vi.fn()}
          onSubmitProof={vi.fn()}
        />,
      )
      const allocation = screen.getByText('Allocated budget').parentElement
      expect(allocation?.querySelector('dd')?.textContent).toBe(label)
      expect(allocation?.textContent).not.toContain('₱0')
    },
  )

  it.each([
    [{ budgetLogged: 0, budgetLoggedEntries: 0 }, 'None yet'],
    [{ budgetLogged: null, budgetLoggedEntries: null }, 'Unavailable'],
    [{ budgetLogged: 1500.5, budgetLoggedEntries: 2 }, '₱1,500.50'],
  ])('labels the logged budget %j as %s and never fabricates ₱0', (logged, label) => {
    render(
      <ActivityDetailContent
        activity={{ ...activity, ...logged }}
        canDecideProof={false}
        canEdit={false}
        canLogExpense={false}
        canRequestExtension={false}
        canSubmitProof={false}
        canValidateExpense={false}
        canValidateProof={false}
        indicators={[]}
        journeyStages={[]}
        onActivityChanged={vi.fn()}
        onEdit={vi.fn()}
        onSubmitProof={vi.fn()}
      />,
    )
    const cell = screen.getByText('Logged budget').parentElement?.querySelector('dd')
    expect(cell?.textContent).toBe(label)
    expect(cell?.textContent).not.toBe('₱0.00')
  })

  it('shows a pending progress note as a progress review, not as submitted proof', () => {
    const noteActivity: Activity = {
      ...activity,
      storedStatus: 'IN_PROGRESS',
      status: 'In Progress',
      updateNotes: [
        {
          id: 'b0000000-0000-4000-8000-00000000000b',
          kind: 'progress',
          note: 'Halfway through sessions.',
          progress: 50,
          status: 'Submitted',
          submittedBy: 'Synthetic officer',
          submittedAt: '2026-09-27T00:00:00.000Z',
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      ],
    }
    const props = {
      canDecideProof: false,
      canEdit: false,
      canLogExpense: false,
      canRequestExtension: false,
      canSubmitProof: false,
      canValidateExpense: false,
      indicators: [],
      journeyStages: [],
      onActivityChanged: vi.fn(),
      onEdit: vi.fn(),
      onSubmitProof: vi.fn(),
    }
    const { rerender } = render(
      <ActivityDetailContent activity={noteActivity} canValidateProof {...props} />,
    )
    expect(screen.getByText('No proof has been submitted.')).toBeTruthy()
    expect(screen.getByText(/progress note, awaiting review/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Review progress/ })).toBeTruthy()
    rerender(<ActivityDetailContent activity={noteActivity} canValidateProof={false} {...props} />)
    expect(screen.queryByRole('button', { name: /Review progress/ })).toBeNull()
  })
})
