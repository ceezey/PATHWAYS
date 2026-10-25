/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  confirmDraftCheck: vi.fn(),
  getDigitalForms: vi.fn(),
  getActivities: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'forms.read', 'forms.manage', 'imports.read'],
    assignedProjectIds: ['project-1'],
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/providers/current-role-provider', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/api/forms', () => ({
  formsClient: { confirmDraftCheck: api.confirmDraftCheck, getDigitalForms: api.getDigitalForms },
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

const summary = {
  addedFields: ['given_name'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 0,
  defaults: [],
  rules: [],
  needsCheck: [],
}
const draft = {
  id: 'draft-1',
  projectId: 'project-1',
  code: 'registration',
  version: 2,
  name: 'Registration',
  formType: 'OTHER',
  status: 'DRAFT',
  activityId: null,
  journeyStageId: null,
  updatedAt: '2026-10-23T00:00:00Z',
  createdByCurrentUser: true,
  draftSummary: summary,
  fields: [
    {
      id: 'f1',
      code: 'given_name',
      label: 'Given name',
      dataType: 'TEXT',
      required: false,
      metadataKey: false,
      sadddField: false,
    },
  ],
}
const open = () =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialProjectId="project-1"
        initialFormId="draft-1"
        initialView="builder"
      />
    </DisplayLabelsProvider>,
  )

describe('draft prepared from an import', () => {
  beforeEach(() => {
    api.getProjectsForRole.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([draft])
    api.getActivities.mockResolvedValue([])
    api.getIndicators.mockResolvedValue([])
  })
  afterEach(cleanup)

  it('shows the change summary stored on the draft to any viewer opening it fresh', async () => {
    open()
    expect(await screen.findByText('Draft from import')).toBeTruthy()
  })

  it('shows no summary on a draft without one or on a published form', async () => {
    for (const form of [
      { ...draft, draftSummary: null },
      { ...draft, status: 'PUBLISHED', draftSummary: null },
    ]) {
      api.getDigitalForms.mockResolvedValue([form])
      open()
      await waitFor(() =>
        expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe(
          'Registration',
        ),
      )
      expect(screen.queryByText('Draft from import')).toBeNull()
      cleanup()
    }
  })

  it('confirms a needs-check field against the loaded draft and drops its badge', async () => {
    const flagged = {
      ...draft,
      draftSummary: {
        ...summary,
        needsCheck: [{ fieldCode: 'given_name', reason: 'SUGGESTED_SOURCE_NAME' }],
      },
    }
    api.getDigitalForms.mockResolvedValue([flagged])
    api.confirmDraftCheck.mockResolvedValue({
      ...draft,
      updatedAt: '2026-10-24T00:00:00Z',
    })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Given name' }))
    await waitFor(() => expect(screen.queryByText('Needs check')).toBeNull())
    expect(api.confirmDraftCheck).toHaveBeenCalledWith(
      'project-1',
      'draft-1',
      'given_name',
      '2026-10-23T00:00:00Z',
    )
    expect(screen.queryByRole('button', { name: 'Confirm Given name' })).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('Given name confirmed.')
    await waitFor(() => expect(document.activeElement?.id).toMatch(/^collection-field-choice-/))
    expect(document.activeElement?.textContent).toContain('Given name')
  })

  it('shows no summary when the form is opened any other way', async () => {
    api.getDigitalForms.mockResolvedValue([{ ...draft, draftSummary: null }])
    open()
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Registration'),
    )
    expect(screen.queryByText('Draft from import')).toBeNull()
  })
})
