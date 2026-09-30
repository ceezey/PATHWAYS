/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

vi.mock('./activity-expense-dialog', () => ({ ActivityExpenseDialog: () => null }))
vi.mock('./activity-expense-review-dialog', () => ({ ActivityExpenseReviewDialog: () => null }))
vi.mock('./activity-explain-delay-dialog', () => ({
  ActivityExplainDelayDialog: () => <div>Explain delay dialog</div>,
  categoryLabels: {
    WEATHER: 'Weather',
    SECURITY: 'Security',
    FUNDING: 'Funding',
    COMMUNITY: 'Community',
    LOGISTICS: 'Logistics',
    OTHER: 'Other',
  },
}))
vi.mock('./activity-proof-files', () => ({ ActivityProofFiles: () => null }))
vi.mock('./activity-proof-review-dialog', () => ({ ActivityProofReviewDialog: () => null }))

import { ActivityDetailContent } from './activity-detail-panel'
// These tests cover the hidden state of controls behind UNFINISHED_CONTROLS_UI_ENABLED.
vi.mock('@/constants/feature-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/feature-flags')>()),
  UNFINISHED_CONTROLS_UI_ENABLED: false,
}))

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
  overdueExplanations: [],
  overdueExplanationNeeded: false,
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

  it('hides Request an extension while it has no backend', () => {
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
    expect(screen.queryByRole('button', { name: 'Request an extension' })).toBeNull()
    expect(screen.queryByText('Not available yet')).toBeNull()
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

  it('offers proof review only once every file is submitted, and explains the wait before that', () => {
    const proofActivity = (storedStatus: 'IN_PROGRESS' | 'FOR_REVIEW'): Activity => ({
      ...activity,
      storedStatus,
      status: storedStatus === 'FOR_REVIEW' ? 'For Review' : 'In Progress',
      submittedProof: [
        {
          id: 'c0000000-0000-4000-8000-00000000000c',
          updateId: 'b0000000-0000-4000-8000-00000000000b',
          fileName: 'site.jpg',
          status: 'Submitted',
          submittedAt: '2026-09-27T00:00:00.000Z',
          submittedBy: 'Synthetic officer',
          updateUpdatedAt: '2026-09-27T00:00:00.000Z',
          note: 'Sessions held.',
        },
      ],
      updateNotes: [
        {
          id: 'b0000000-0000-4000-8000-00000000000b',
          kind: 'proof',
          note: 'Sessions held.',
          progress: 60,
          beneficiariesReachedThisSession: null,
          status: 'Submitted',
          submittedBy: 'Synthetic officer',
          submittedAt: '2026-09-27T00:00:00.000Z',
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      ],
    })
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
      <ActivityDetailContent activity={proofActivity('IN_PROGRESS')} canValidateProof {...props} />,
    )
    expect(screen.queryByRole('button', { name: /Review & validate proof/ })).toBeNull()
    expect(screen.getByText(/Waiting for the officer to finish uploading/)).toBeTruthy()
    rerender(
      <ActivityDetailContent activity={proofActivity('FOR_REVIEW')} canValidateProof {...props} />,
    )
    expect(screen.getByRole('button', { name: /Review & validate proof/ })).toBeTruthy()
    expect(screen.queryByText(/Waiting for the officer to finish uploading/)).toBeNull()
  })

  it('shows pending expenses linked to this activity only when a validator can review them', () => {
    const pendingExpenses = [
      {
        id: 'e0000000-0000-4000-8000-00000000000e',
        activityId: activity.id,
        projectId: activity.projectId,
        amount: 1500.5,
        category: 'Training supplies',
        date: '2026-09-28',
        description: 'Printed handouts.',
        status: 'For Verification' as const,
        updatedAt: '2026-09-28T00:00:00.000Z',
        receiptEvidenceId: 'r0000000-0000-4000-8000-00000000000r',
      },
    ]
    const { rerender } = render(
      <ActivityDetailContent
        activity={activity}
        canDecideProof={false}
        canEdit={false}
        canLogExpense={false}
        canRequestExtension={false}
        canSubmitProof={false}
        canValidateExpense
        canValidateProof={false}
        indicators={[]}
        journeyStages={[]}
        onActivityChanged={vi.fn()}
        onEdit={vi.fn()}
        onSubmitProof={vi.fn()}
        pendingExpenses={pendingExpenses}
      />,
    )
    expect(screen.getByText('Submitted expenses for validation')).toBeTruthy()
    expect(screen.getByText('Training supplies')).toBeTruthy()

    rerender(
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
        pendingExpenses={pendingExpenses}
      />,
    )
    expect(screen.queryByText('Submitted expenses for validation')).toBeNull()
  })

  const baseProps = {
    canDecideProof: false,
    canEdit: false,
    canLogExpense: false,
    canRequestExtension: false,
    canSubmitProof: false,
    canValidateExpense: false,
    canValidateProof: false,
    indicators: [],
    journeyStages: [],
    onActivityChanged: vi.fn(),
    onEdit: vi.fn(),
    onSubmitProof: vi.fn(),
  }

  it('shows the overdue-explanation-needed badge only when the server flag is true', () => {
    const { rerender } = render(
      <ActivityDetailContent
        activity={{ ...activity, overdueExplanationNeeded: true }}
        {...baseProps}
      />,
    )
    expect(screen.getByText('Overdue: explanation needed')).toBeTruthy()
    rerender(
      <ActivityDetailContent
        activity={{ ...activity, overdueExplanationNeeded: false }}
        {...baseProps}
      />,
    )
    expect(screen.queryByText('Overdue: explanation needed')).toBeNull()
  })

  it('shows Explain delay only when capability and overdue status both hold', () => {
    const baseCapabilities = {
      canEdit: false,
      canRecordProgress: false,
      canSubmitProof: false,
      canExplainOverdue: true,
    }
    const overdueActivity: Activity = {
      ...activity,
      status: 'Overdue',
      storedStatus: 'IN_PROGRESS',
      capabilities: baseCapabilities,
    }
    const { rerender } = render(<ActivityDetailContent activity={overdueActivity} {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Explain delay' })).toBeTruthy()

    // Capability false: no button even though overdue.
    rerender(
      <ActivityDetailContent
        activity={{
          ...overdueActivity,
          capabilities: { ...baseCapabilities, canExplainOverdue: false },
        }}
        {...baseProps}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Explain delay' })).toBeNull()

    // Not overdue: no button even with the capability.
    rerender(
      <ActivityDetailContent
        activity={{ ...overdueActivity, status: 'In Progress' }}
        {...baseProps}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Explain delay' })).toBeNull()
  })

  it('renders the overdue explanation history newest first, or None yet for an overdue activity with none', () => {
    const { rerender } = render(
      <ActivityDetailContent activity={{ ...activity, status: 'Overdue' }} {...baseProps} />,
    )
    expect(screen.getByText('Overdue explanations')).toBeTruthy()
    expect(screen.getByText('None yet.')).toBeTruthy()

    rerender(
      <ActivityDetailContent
        activity={{
          ...activity,
          status: 'Overdue',
          overdueExplanations: [
            {
              id: 'exp-1',
              category: 'WEATHER',
              explanation: 'A storm delayed the site visit.',
              actorName: 'Synthetic officer',
              recordedAt: '2026-09-20T00:00:00.000Z',
            },
          ],
        }}
        {...baseProps}
      />,
    )
    expect(screen.getByText('Weather')).toBeTruthy()
    expect(screen.getByText('A storm delayed the site visit.')).toBeTruthy()
    expect(screen.queryByText('None yet.')).toBeNull()
  })

  it('hides the overdue explanation history for a never-overdue activity with no entries', () => {
    render(<ActivityDetailContent activity={{ ...activity, status: 'Planned' }} {...baseProps} />)
    expect(screen.queryByText('Overdue explanations')).toBeNull()
  })
  describe('returned proof correction', () => {
    const returned = (status: 'Flagged' | 'Accepted', withReason = true): Activity => ({
      ...activity,
      storedStatus: 'IN_PROGRESS',
      status: 'In Progress',
      capabilities: { canSubmitProof: true } as Activity['capabilities'],
      submittedProof: [
        {
          id: 'c0000000-0000-4000-8000-00000000000c',
          updateId: 'b0000000-0000-4000-8000-00000000000b',
          fileName: 'site.jpg',
          status,
          submittedAt: '2026-09-27T00:00:00.000Z',
          submittedBy: 'Synthetic officer',
          updateUpdatedAt: '2026-09-27T00:00:00.000Z',
          note: 'Sessions held.',
        },
      ],
      updateNotes: [
        {
          id: 'b0000000-0000-4000-8000-00000000000b',
          kind: 'proof',
          note: 'Sessions held.',
          progress: 60,
          status,
          submittedBy: 'Synthetic officer',
          submittedAt: '2026-09-27T00:00:00.000Z',
          reviewedBy: withReason ? 'Synthetic M&E' : null,
          reviewedAt: null,
          reviewReason: withReason ? 'Photo is blurry.' : null,
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      ],
    })
    const base = {
      canDecideProof: false,
      canEdit: false,
      canLogExpense: false,
      canRequestExtension: false,
      canValidateExpense: false,
      indicators: [],
      journeyStages: [],
      onActivityChanged: vi.fn(),
      onEdit: vi.fn(),
    }

    it('shows Submit correction to the submitter, opens the dialog, and shows the reason', () => {
      const onSubmitProof = vi.fn()
      const a = returned('Flagged')
      render(
        <ActivityDetailContent
          activity={a}
          canSubmitProof
          canValidateProof={false}
          onSubmitProof={onSubmitProof}
          {...base}
        />,
      )
      expect(screen.getByText('Returned by Synthetic M&E: Photo is blurry.')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Submit correction' }))
      expect(onSubmitProof).toHaveBeenCalledWith(a)
    })

    it('hides the button for M&E and for accepted proofs', () => {
      const { rerender } = render(
        <ActivityDetailContent
          activity={returned('Flagged')}
          canSubmitProof={false}
          canValidateProof
          onSubmitProof={vi.fn()}
          {...base}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Submit correction' })).toBeNull()
      rerender(
        <ActivityDetailContent
          activity={returned('Accepted')}
          canSubmitProof
          canValidateProof={false}
          onSubmitProof={vi.fn()}
          {...base}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Submit correction' })).toBeNull()
    })

    it('omits the reason line when none is recorded', () => {
      render(
        <ActivityDetailContent
          activity={returned('Flagged', false)}
          canSubmitProof
          canValidateProof={false}
          onSubmitProof={vi.fn()}
          {...base}
        />,
      )
      expect(screen.queryByText(/Returned by/)).toBeNull()
    })
  })
})
