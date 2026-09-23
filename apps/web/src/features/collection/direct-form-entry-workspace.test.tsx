/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DirectFormEntryWorkspace } from './direct-form-entry-workspace'

const api = vi.hoisted(() => ({
  getDigitalForm: vi.fn(),
  getDirectSubmission: vi.fn(),
  getDirectSubmissionByClientId: vi.fn(),
}))

vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class PathwaysClientError extends Error {
    code = 'network'
    fieldErrors = []
  },
  pathwaysClient: api,
}))

describe('direct form persisted submission reload', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads the selected scoped record by id and restores its persisted responses', async () => {
    api.getDigitalForm.mockResolvedValue({
      id: 'form-1',
      projectId: 'project-1',
      code: 'entry',
      version: 4,
      name: 'Entry form',
      description: null,
      formType: 'OTHER',
      status: 'PUBLISHED',
      activityId: null,
      journeyStageId: null,
      updatedAt: '2026-09-23T00:00:00.000Z',
      createdByCurrentUser: true,
      fields: [
        {
          id: 'field-1',
          code: 'note',
          label: 'Note',
          dataType: 'TEXT',
          required: false,
          metadataKey: false,
          sadddField: false,
        },
      ],
    })
    api.getDirectSubmission.mockResolvedValue({
      id: 'submission-1',
      clientSubmissionId: 'client-1',
      status: 'DRAFT',
      formId: 'form-1',
      formVersion: 4,
      updatedAt: '2026-09-23T01:00:00.000Z',
      values: { note: 'Persisted response' },
    })

    render(
      <DirectFormEntryWorkspace
        formId="form-1"
        initialSubmissionId="submission-1"
        projectId="project-1"
      />,
    )

    await waitFor(() => expect(screen.getByDisplayValue('Persisted response')).toBeTruthy())
    expect(api.getDirectSubmission).toHaveBeenCalledWith('project-1', 'form-1', 'submission-1')
    expect(api.getDirectSubmissionByClientId).not.toHaveBeenCalled()
    expect(screen.getByText('Your persisted draft was restored.')).toBeTruthy()
  })
})
