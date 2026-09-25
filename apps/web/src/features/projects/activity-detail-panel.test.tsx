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
  projectGoalComparison: { state: 'BELOW_TARGET', reason: null },
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
  })
})
