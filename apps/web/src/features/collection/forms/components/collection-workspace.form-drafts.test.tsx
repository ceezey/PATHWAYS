/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

// Real-timer waits in the import rows cross several renders and need headroom under load.
configure({ asyncUtilTimeout: 5000 })

const api = vi.hoisted(() => ({
  createDigitalForm: vi.fn(),
  createDigitalFormVersion: vi.fn(),
  generateDigitalForm: vi.fn(),
  publishDigitalForm: vi.fn(),
  updateDigitalForm: vi.fn(),
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  getImportBatch: vi.fn(),
  saveImportMapping: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForm: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const core = vi.hoisted(() => ({ downloadCoreArtifact: vi.fn() }))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  assignedProjectIds: ['futuremakers-ncr'],
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'collection.read',
      'forms.read',
      'forms.export',
      'forms.manage',
      'forms.templates.import',
      'forms.publish',
      'submissions.write',
      'imports.read',
      'imports.upload',
      'imports.review',
      'imports.validate',
      'imports.process',
    ],
    assignedProjectIds: ['futuremakers-ncr'],
  },
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => currentAccess,
}))

vi.mock('@/lib/api/core/artifact-download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/artifact-download')>()),
  downloadCoreArtifact: core.downloadCoreArtifact,
}))

vi.mock('@/lib/api/forms', () => ({
  formsClient: {
    getDigitalForms: api.getDigitalForms,
    createDigitalForm: api.createDigitalForm,
    createDigitalFormVersion: api.createDigitalFormVersion,
    generateDigitalForm: api.generateDigitalForm,
    publishDigitalForm: api.publishDigitalForm,
    updateDigitalForm: api.updateDigitalForm,
    getDigitalForm: api.getDigitalForm,
  },
}))
vi.mock('@/lib/api/imports', () => ({
  importsClient: {
    uploadImport: api.uploadImport,
    automaticImportMapping: api.automaticImportMapping,
    getImportBatch: api.getImportBatch,
    saveImportMapping: api.saveImportMapping,
    validateImport: api.validateImport,
    processImport: api.processImport,
  },
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

beforeEach(() => {
  toasts.success.mockClear()
  sessionStorage.clear()
  currentAccess.profile.userId = 'actor-a'
  currentAccess.profile.organizationId = 'org-a'
  currentAccess.profile.assignedProjectIds = ['futuremakers-ncr']
  currentAccess.role = 'Monitoring and Evaluation Officer'
  currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  currentAccess.profile.permissions = [
    'projects.read',
    'activities.read',
    'monitoring.read',
    'collection.read',
    'forms.read',
    'forms.export',
    'forms.manage',
    'forms.templates.import',
    'forms.publish',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'imports.review',
    'imports.validate',
    'imports.process',
  ]
  api.getProjectsForRole.mockResolvedValue([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
  api.getDigitalForms.mockResolvedValue([])
  api.getActivities.mockResolvedValue([])
  api.getIndicators.mockResolvedValue([])
  // Mirrors the real helper: bytes are saved only while the caller still owns the request.
  core.downloadCoreArtifact.mockImplementation(
    async (_url: string, _fileName: string, isOwnerCurrent: () => boolean) => {
      if (!isOwnerCurrent()) throw new Error('Artifact ownership changed.')
      URL.createObjectURL(new Blob(['artifact']))
      document.createElement('a').click()
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const stamp = '2026-09-22T00:00:00Z'
const draft = {
  id: 'form-draft',
  projectId: 'futuremakers-ncr',
  code: 'intake_draft',
  version: 1,
  name: 'Intake draft',
  description: 'Kept description',
  formType: 'PRE_TEST',
  status: 'DRAFT',
  activityId: 'activity-1',
  journeyStageId: 'stage-1',
  updatedAt: stamp,
  createdByCurrentUser: false,
  fields: [
    {
      id: 'f1',
      code: 'choice',
      label: 'Choice',
      dataType: 'TEXT',
      required: true,
      metadataKey: false,
      sadddField: false,
    },
    {
      id: 'f2',
      code: 'count',
      label: 'Count',
      dataType: 'INTEGER',
      required: false,
      metadataKey: false,
      sadddField: false,
    },
  ],
}
const published = {
  ...draft,
  id: 'form-live',
  code: 'intake_live',
  name: 'Intake live',
  status: 'PUBLISHED',
  version: 2,
}
const renderOpenForm = (formId: string) =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialProjectId="futuremakers-ncr"
        initialFormId={formId}
        initialView="builder"
      />
    </DisplayLabelsProvider>,
  )
const renderFormsList = () =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace initialView="forms" />
    </DisplayLabelsProvider>,
  )
const saveFromDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Save form draft?' })).getByRole('button', {
      name: 'Save draft',
    }),
  )
}

describe('collection draft save', () => {
  it('retries a failed create with the same code, then updates the draft against its saved revision and server code', async () => {
    api.createDigitalForm
      .mockRejectedValueOnce(Object.assign(new Error('Rejected'), { status: 422 }))
      .mockImplementation(async (projectId, input) => ({
        ...draft,
        ...input,
        id: 'created-form',
        projectId,
        code: 'server_code',
        createdByCurrentUser: true,
      }))
    api.updateDigitalForm.mockImplementation(async (_projectId, _id, input) => ({
      ...draft,
      ...input,
      id: 'created-form',
    }))
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalledWith('futuremakers-ncr'))
    saveFromDialog()
    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalledOnce())
    const dialog = await screen.findByRole('dialog', { name: 'Save form draft?' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save draft' }).matches(':disabled')).toBe(
        false,
      ),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Draft saved to the server.'))
    expect(api.createDigitalForm).toHaveBeenCalledTimes(2)
    const codes = api.createDigitalForm.mock.calls.map((call) => call[1].code)
    expect(codes[0]).toMatch(/^journey_1_/)
    expect(codes[1]).toBe(codes[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalledOnce())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'created-form',
      expect.objectContaining({ code: 'server_code', expectedUpdatedAt: stamp }),
    )
  })

  it('keeps the edits of an opened form when the saved copy comes back from the server', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue({
      ...draft,
      name: 'Server title',
      updatedAt: '2026-09-23T00:00:00Z',
    })
    renderOpenForm('form-draft')
    const title = (await screen.findByDisplayValue('Intake draft')) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Edited title' } })
    saveFromDialog()
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Draft saved to the server.'))
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Edited title')
  })

  it('sends the revision of the previous save with the next save', async () => {
    const revised = '2026-09-23T00:00:00Z'
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue({ ...draft, updatedAt: revised })
    renderOpenForm('form-draft')
    await screen.findByDisplayValue('Intake draft')
    saveFromDialog()
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Draft saved to the server.'))
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalledTimes(2))
    const sent = api.updateDigitalForm.mock.calls.map((call) => call[2].expectedUpdatedAt)
    expect(sent).toEqual([stamp, revised])
  })

  it('saves against the revision the edit started from when the forms list reloads with a newer one', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue(draft)
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialProjectId="futuremakers-ncr"
          initialFormId="form-draft"
          initialView="import"
        />
      </DisplayLabelsProvider>,
    )
    await screen.findByDisplayValue('Intake draft')
    api.getDigitalForms.mockResolvedValue([{ ...draft, updatedAt: '2026-09-26T00:00:00Z' }])
    fireEvent.click(screen.getByRole('button', { name: 'Build forms' }))
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalledTimes(2))
    await act(async () => undefined)
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalledOnce())
    expect(api.updateDigitalForm.mock.calls[0]?.[2].expectedUpdatedAt).toBe(stamp)
  })
})

describe('collection publish', () => {
  it('publishes the opened draft at its revision, reports it and returns to the Forms list', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.publishDigitalForm.mockResolvedValue({
      ...draft,
      status: 'PUBLISHED',
      updatedAt: '2026-09-24T00:00:00Z',
    })
    renderOpenForm('form-draft')
    fireEvent.click(await screen.findByRole('button', { name: 'Publish saved draft' }))
    await waitFor(() =>
      expect(api.publishDigitalForm).toHaveBeenCalledWith('futuremakers-ncr', 'form-draft', stamp),
    )
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Form published to the server.'),
    )
    expect(await screen.findByRole('button', { name: 'Open form' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish saved draft' })).toBeNull()
  })
})

describe('collection saved forms list', () => {
  it('opens a saved draft in the builder with its links and selects its first field', async () => {
    api.getDigitalForms.mockResolvedValue([draft])
    api.updateDigitalForm.mockResolvedValue(draft)
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Open form' }))
    expect(((await screen.findByLabelText('Form title')) as HTMLInputElement).value).toBe(
      'Intake draft',
    )
    const selected = Array.from(document.querySelectorAll('button[aria-pressed="true"]'))
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('Choice')
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'form-draft',
      expect.objectContaining({
        description: 'Kept description',
        activityId: 'activity-1',
        journeyStageId: 'stage-1',
      }),
    )
  })

  it('opens a published form read-only with a notice', async () => {
    api.getDigitalForms.mockResolvedValue([published])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Open form' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'This published form is read-only in this view. Create a new version before changing its fields.',
      ),
    )
    expect(((await screen.findByLabelText('Form title')) as HTMLInputElement).value).toBe(
      'Intake live',
    )
  })

  it('reports the export and refuses a form of another project', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    api.getDigitalForms.mockResolvedValue([published])
    const view = renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Exported intake_live version 2 as CSV.'),
    )
    view.unmount()
    core.downloadCoreArtifact.mockClear()
    api.getDigitalForms.mockResolvedValue([{ ...published, projectId: 'other-project' }])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await act(async () => undefined)
    expect(core.downloadCoreArtifact).not.toHaveBeenCalled()
  })

  it('releases the screen after refusing the export of a form of another project', async () => {
    api.getDigitalForms.mockResolvedValue([{ ...published, projectId: 'other-project' }])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await act(async () => undefined)
    expect(screen.getByRole('button', { name: 'Export form' }).matches(':disabled')).toBe(false)
  })

  it('reports no export when the screen changed hands while the file was being saved', async () => {
    core.downloadCoreArtifact.mockImplementation(async () => clearSensitiveDraftStorage())
    api.getDigitalForms.mockResolvedValue([published])
    renderFormsList()
    fireEvent.click(await screen.findByRole('button', { name: 'Export form' }))
    await waitFor(() => expect(core.downloadCoreArtifact).toHaveBeenCalledOnce())
    await act(async () => undefined)
    expect(toasts.success).not.toHaveBeenCalled()
  })
})

describe('collection form versions and copies', () => {
  it('opens the new draft version with its own code, revision and details', async () => {
    const next = {
      ...draft,
      id: 'form-next',
      code: 'intake_live_v3',
      name: 'Intake next',
      description: 'Next description',
      formType: 'POST_TEST',
      activityId: 'activity-2',
      journeyStageId: 'stage-2',
      version: 3,
      updatedAt: '2026-09-25T00:00:00Z',
      fields: [{ ...draft.fields[0], id: 'g1', code: 'next_field', label: 'Next field' }],
    }
    api.getDigitalForms.mockResolvedValue([published])
    api.createDigitalFormVersion.mockResolvedValue(next)
    api.updateDigitalForm.mockResolvedValue(next)
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Create new version' }))
    await waitFor(() =>
      expect(api.createDigitalFormVersion).toHaveBeenCalledWith('futuremakers-ncr', 'form-live'),
    )
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('A new draft version is ready for editing.'),
    )
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Intake next')
    saveFromDialog()
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'form-next',
      expect.objectContaining({
        code: 'intake_live_v3',
        description: 'Next description',
        formType: 'POST_TEST',
        activityId: 'activity-2',
        journeyStageId: 'stage-2',
        expectedUpdatedAt: next.updatedAt,
        fields: [expect.objectContaining({ code: 'next_field' })],
      }),
    )
  })

  it('keeps a generated copy code within the 64 character limit', async () => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'forms.generate']
    api.getDigitalForms.mockResolvedValue([{ ...published, code: 'a'.repeat(64) }])
    api.generateDigitalForm.mockResolvedValue({
      ...published,
      id: 'form-copy',
      name: 'Intake live (copy)',
    })
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Generate copy' }))
    await waitFor(() => expect(api.generateDigitalForm).toHaveBeenCalledOnce())
    const code = api.generateDigitalForm.mock.calls[0]?.[1].code as string
    expect(code).toHaveLength(64)
    expect(code).toMatch(/^a+_copy_[a-z0-9]+$/)
  })

  it('allows another version after a failed attempt', async () => {
    api.getDigitalForms.mockResolvedValue([published])
    api.createDigitalFormVersion.mockRejectedValue(new Error('Version failed.'))
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Create new version' }))
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Version failed.'))
    fireEvent.click(screen.getByRole('button', { name: 'Create new version' }))
    await waitFor(() => expect(api.createDigitalFormVersion).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['fails', () => api.generateDigitalForm.mockRejectedValue(new Error('Copy failed.'))],
    [
      'succeeds',
      () => api.generateDigitalForm.mockResolvedValue({ ...published, id: 'form-copy' }),
    ],
  ])('allows another copy after a copy %s', async (_name, arrange) => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'forms.generate']
    api.getDigitalForms.mockResolvedValue([published])
    arrange()
    renderOpenForm('form-live')
    fireEvent.click(await screen.findByRole('button', { name: 'Generate copy' }))
    await waitFor(() => expect(api.generateDigitalForm).toHaveBeenCalledOnce())
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Generate copy' }))
    await waitFor(() => expect(api.generateDigitalForm).toHaveBeenCalledTimes(2))
  })

  it('lists a generated copy beside the draft it was made from', async () => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'forms.generate']
    api.getDigitalForms.mockResolvedValue([draft])
    api.generateDigitalForm.mockResolvedValue({ ...draft, id: 'form-copy', name: 'Intake copy' })
    api.publishDigitalForm.mockResolvedValue({ ...draft, status: 'PUBLISHED' })
    renderOpenForm('form-draft')
    fireEvent.click(await screen.findByRole('button', { name: 'Generate copy' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Generated draft form Intake copy.'),
    )
    // The reload for the Forms view is dropped, so the list shows what the screen already held.
    api.getDigitalForms.mockImplementation(async () => {
      clearSensitiveDraftStorage()
      return []
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publish saved draft' }))
    expect(await screen.findAllByRole('button', { name: 'Open form' })).toHaveLength(2)
  })
})
