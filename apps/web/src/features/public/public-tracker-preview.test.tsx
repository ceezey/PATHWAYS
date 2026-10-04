/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PublicTrackerPreview } from './public-tracker-preview'

const projectId = '10000000-0000-4000-8000-000000000002'
const read = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))

vi.mock('@/lib/services/core-feature-client', () => ({ coreFeatureClient: {} }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => read.result,
}))

describe('public tracker staff preview', () => {
  afterEach(cleanup)

  it('renders the frozen snapshot of an unpublished revision with its review state', () => {
    read.result = {
      isPending: false,
      isError: false,
      data: {
        revision: 3,
        state: 'APPROVED',
        summary: 'Approved synthetic summary.',
        snapshot: {
          id: projectId,
          title: 'Synthetic preview project',
          code: 'SYN-02',
          approvedSummary: 'Approved synthetic summary.',
          area: null,
          sector: null,
          startDate: null,
          endDate: null,
        },
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    }
    render(<PublicTrackerPreview projectId={projectId} />)
    expect(screen.getByText('Approved, not public · Revision 3')).toBeTruthy()
    expect(screen.getByText('Not yet published')).toBeTruthy()
    expect(screen.getByText('Staff preview.')).toBeTruthy()
  })

  it('asks for a submitted summary when no publication row exists', () => {
    read.result = { isPending: false, isError: false, data: null }
    render(<PublicTrackerPreview projectId={projectId} />)
    expect(screen.getByText('No public summary yet')).toBeTruthy()
  })
})
