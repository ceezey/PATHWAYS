/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/pathways', async (original) => ({
  ...(await original<object>()),
  ProofPreviewDialog: () => null,
}))
vi.mock('@/lib/services/core-feature-client', () => ({ saveCoreArtifact: vi.fn() }))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { downloadActivityProof: vi.fn() },
}))

import type { ActivityProof } from '@/types/pathways'
import { ActivityProofFiles } from './activity-proof-files'

const file = (overrides: Partial<ActivityProof>): ActivityProof => ({
  id: 'proof-1',
  updateId: 'update-1',
  fileName: 'Attendance_Mar15_Batch1.pdf',
  status: 'Submitted',
  submittedAt: '2026-03-15T00:00:00.000Z',
  submittedBy: 'Ron Perez',
  updateUpdatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

const group = {
  ...file({}),
  items: [
    file({ id: 'proof-1', status: 'Flagged', rejectionReason: 'Sheet is missing signatures.' }),
    file({ id: 'proof-2', fileName: 'Workshop_Photos_Mar15.zip', status: 'Accepted' }),
  ],
}

afterEach(cleanup)

describe('ActivityProofFiles', () => {
  it('states each file review outcome in plain words with its reason', () => {
    render(<ActivityProofFiles proof={group} />)
    expect(screen.getByText('Insufficient')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('Sheet is missing signatures.')).toBeTruthy()
  })

  it('opens a file only for a principal allowed to read evidence', () => {
    const { rerender } = render(
      <ActivityProofFiles activityId="act-1" projectId="proj-1" proof={group} />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<ActivityProofFiles activityId="act-1" canOpen projectId="proj-1" proof={group} />)
    expect(screen.queryAllByRole('button')).toHaveLength(2)
  })

  it('never offers to open a file whose evidence id it does not have', () => {
    render(
      <ActivityProofFiles
        activityId="act-1"
        canOpen
        projectId="proj-1"
        proof={file({ fileNames: ['one.pdf', 'two.pdf'] })}
      />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('one.pdf')).toBeTruthy()
  })
})
