/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ManualDataEntryWorkspace } from './manual-data-entry-workspace'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getDigitalForms: vi.fn(),
  getProjectsForRole: vi.fn(),
  listDirectSubmissions: vi.fn(),
}))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => ({ role: 'Project Officer' }),
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))

const form = {
  id: 'form-1',
  projectId: 'project-1',
  code: 'entry',
  version: 2,
  name: 'Activity entry',
  description: null,
  formType: 'OTHER',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  updatedAt: '2026-09-23T00:00:00.000Z',
  createdByCurrentUser: true,
  fields: [],
} as const

describe('manual data entry persisted record listing', () => {
  beforeEach(() => {
    api.getProjectsForRole.mockResolvedValue([{ id: 'project-1', title: 'Project One' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getActivities.mockResolvedValue([])
    api.listDirectSubmissions.mockResolvedValue({
      offset: 0,
      limit: 5,
      total: 2,
      items: [
        {
          id: 'draft-1',
          status: 'DRAFT',
          formVersion: 2,
          updatedAt: '2026-09-23T01:00:00.000Z',
        },
        {
          id: 'final-1',
          status: 'VALIDATED',
          formVersion: 2,
          submittedAt: '2026-09-23T02:00:00.000Z',
          updatedAt: '2026-09-23T02:00:00.000Z',
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists scoped server records and links each selection to the persisted submission', async () => {
    render(<ManualDataEntryWorkspace />)

    await waitFor(() => expect(screen.getByText('Project One')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project-1' } })
    await waitFor(() => expect(screen.getByText('Activity entry')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Published form'), { target: { value: 'form-1' } })

    await waitFor(() => expect(screen.getByText('Finalized (validated)')).toBeTruthy())
    expect(api.listDirectSubmissions).toHaveBeenCalledWith('project-1', 'form-1', 0, 5)
    expect(screen.getByRole('link', { name: 'Resume draft' }).getAttribute('href')).toContain(
      'submissionId=draft-1',
    )
    expect(screen.getByRole('link', { name: 'View record' }).getAttribute('href')).toContain(
      'submissionId=final-1',
    )
  })
})
