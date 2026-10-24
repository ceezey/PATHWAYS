/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

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

const renderImportWorkspace = () =>
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace initialMode="import" initialView="import" />
    </DisplayLabelsProvider>,
  )

const csvFile = (name: string, readText: () => Promise<string>) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: readText })
  return file
}

describe('collection import workspace', () => {
  it('cannot create an unrelated draft while an existing form is delayed or unavailable', async () => {
    let rejectLoad: ((error: Error) => void) | undefined
    api.getDigitalForms.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject
        }),
    )
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialProjectId="futuremakers-ncr"
          initialFormId="saved-form"
          initialView="builder"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    const save = screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
    expect(save.matches(':disabled')).toBe(true)
    fireEvent.click(save)
    const dialog = screen.queryByRole('dialog')
    if (dialog) {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    }
    expect(api.createDigitalForm).not.toHaveBeenCalled()
    expect(api.updateDigitalForm).not.toHaveBeenCalled()
    await act(async () => rejectLoad?.(new Error('Form unavailable')))
    expect(save.matches(':disabled')).toBe(true)
    expect(screen.getByText(/saved form is not ready/)).toBeTruthy()
    expect(screen.getByText('Form unavailable')).toBeTruthy()
    expect(api.createDigitalForm).not.toHaveBeenCalled()
    expect(api.updateDigitalForm).not.toHaveBeenCalled()
  })

  it('opens a saved definition and saves its exact types, options, links and limits', async () => {
    const saved = {
      id: 'form-1',
      projectId: 'futuremakers-ncr',
      code: 'original_code',
      name: 'Saved assessment',
      description: 'Preserved description',
      formType: 'POST_TEST',
      status: 'DRAFT',
      version: 3,
      updatedAt: '2026-09-22T00:00:00Z',
      activityId: 'activity-1',
      journeyStageId: 'stage-1',
      createdByCurrentUser: true,
      fields: [
        {
          id: 'field-1',
          code: 'choice',
          label: 'Choice',
          dataType: 'SELECT',
          required: true,
          metadataKey: true,
          sadddField: true,
          allowedValues: ['Yes, with support', 'No'],
        },
        {
          id: 'field-2',
          code: 'count',
          label: 'Count',
          dataType: 'INTEGER',
          required: false,
          metadataKey: false,
          sadddField: false,
          minimumValue: '1',
          maximumValue: '10',
        },
      ],
    }
    api.getDigitalForms.mockResolvedValue([saved])
    api.updateDigitalForm.mockResolvedValue(saved)
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialProjectId="futuremakers-ncr"
          initialFormId="form-1"
          initialView="builder"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(
        screen
          .getByText('Form configuration')
          .closest('.rounded-xl')
          ?.contains(screen.getByLabelText('Form title')),
      ).toBe(true),
    )
    expect(screen.queryByLabelText('Form code')).toBeNull()
    expect(screen.queryByLabelText('Description')).toBeNull()
    expect(screen.queryByText('Linked indicators')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Save form draft?' })).getByRole('button', {
        name: 'Save draft',
      }),
    )
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.updateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      'form-1',
      expect.objectContaining({
        code: 'original_code',
        formType: 'POST_TEST',
        description: 'Preserved description',
        activityId: 'activity-1',
        journeyStageId: 'stage-1',
        expectedUpdatedAt: saved.updatedAt,
        fields: expect.arrayContaining([
          expect.objectContaining({
            dataType: 'SELECT',
            allowedValues: ['Yes, with support', 'No'],
            metadataKey: true,
            sadddField: true,
          }),
          expect.objectContaining({
            dataType: 'INTEGER',
            minimumValue: '1',
            maximumValue: '10',
            allowedValues: undefined,
          }),
        ]),
      }),
    )
  })

  it('creates a Forms draft from a header-only questionnaire file', async () => {
    api.createDigitalForm.mockImplementation(async (projectId, input) => ({
      ...input,
      id: 'created-form',
      projectId,
      status: 'DRAFT',
      updatedAt: '2026-09-22T00:00:00Z',
      fields: input.fields,
    }))
    renderImportWorkspace()
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [
          csvFile(
            'PATHWAYS_Youth_Skills_Assessment_Form.csv',
            async () =>
              'beneficiary_id,attendance_status,pre_test_score,post_test_score,activity_date',
          ),
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/Questionnaire structure ready/)).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    const dialog = screen.getByRole('dialog', { name: 'Create draft form?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))

    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalled())
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        expect.stringMatching(/Draft form .* created on the server/),
      ),
    )
    expect(api.createDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      expect.objectContaining({
        name: 'Youth Skills Assessment Form',
        fields: expect.arrayContaining([expect.objectContaining({ code: 'beneficiary_id' })]),
      }),
    )
  })
})

describe('collection field selection', () => {
  it('exposes and updates exactly one selected field with a visible cue', () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </DisplayLabelsProvider>,
    )

    const choices = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    expect(choices.filter((choice) => choice.getAttribute('aria-pressed') === 'true')).toHaveLength(
      1,
    )
    expect(choices[0].textContent).toContain('Selected')

    fireEvent.click(choices[1])
    expect(choices[0].getAttribute('aria-pressed')).toBe('false')
    expect(choices[1].getAttribute('aria-pressed')).toBe('true')
    expect(choices[1].textContent).toContain('Selected')
  })

  it('requires a contextual confirmation before deleting a field and restores useful focus', async () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </DisplayLabelsProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete Age group' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Age group?' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(dialog.textContent).toContain('Field code: beneficiary_age_group')
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    fireEvent.click(cancel)
    expect(screen.getByRole('button', { name: 'Delete Age group' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Age group' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Age group' }),
    )
    expect(screen.queryByRole('button', { name: 'Delete Age group' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement?.id).toBe('collection-field-choice-field-beneficiary-id'),
    )
  })
})

describe('collection form definition export', () => {
  const exportForm = {
    id: 'form-1',
    projectId: 'futuremakers-ncr',
    code: 'activity_entry',
    version: 2,
    name: 'Activity Entry',
    description: null,
    formType: 'OTHER',
    status: 'PUBLISHED',
    activityId: null,
    journeyStageId: null,
    updatedAt: '2026-09-23T00:00:00.000Z',
    createdByCurrentUser: true,
    fields: [
      {
        code: 'score',
        label: 'Score',
        dataType: 'DECIMAL',
        required: true,
        metadataKey: false,
        sadddField: false,
        sequence: 0,
      },
    ],
  }

  it('exports the form as CSV through the audited server export without a format control', async () => {
    api.getDigitalForms.mockResolvedValue([exportForm])
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(screen.getByText('Activity Entry')).toBeTruthy())
    expect(screen.queryByText('Download format')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export form' }))
    await waitFor(() =>
      expect(core.downloadCoreArtifact).toHaveBeenLastCalledWith(
        '/metadata/projects/futuremakers-ncr/forms/form-1/export?format=CSV',
        'activity-entry-v2.csv',
        expect.any(Function),
      ),
    )
    expect(core.downloadCoreArtifact).toHaveBeenCalledTimes(1)
    expect(api.getDigitalForm).not.toHaveBeenCalled()
  })

  it('lists the draft and published forms of every project under its own heading', async () => {
    currentAccess.profile.assignedProjectIds = ['futuremakers-ncr', 'safe-schools']
    api.getProjectsForRole.mockResolvedValue([
      { id: 'futuremakers-ncr', title: 'Futuremakers NCR' },
      { id: 'safe-schools', title: 'Safe Schools' },
    ])
    const draft = {
      ...exportForm,
      id: 'form-2',
      projectId: 'safe-schools',
      name: 'Registration',
      status: 'DRAFT',
    }
    api.getDigitalForms.mockImplementation(async (projectId: string) =>
      projectId === 'safe-schools' ? [draft] : [exportForm],
    )
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )

    const safeSchools = (await screen.findByRole('heading', { name: 'Safe Schools' })).closest(
      'section',
    ) as HTMLElement
    expect(within(safeSchools).getByText('Registration')).toBeTruthy()
    expect(within(safeSchools).getByText('Draft')).toBeTruthy()
    const futuremakers = screen
      .getByRole('heading', { name: 'Futuremakers NCR' })
      .closest('section') as HTMLElement
    expect(within(futuremakers).getByText('Activity Entry')).toBeTruthy()
    expect(within(futuremakers).getByText('Published')).toBeTruthy()
  })

  it.each([
    ['extend import', 'import', 'extend'],
    ['plain import', 'import', 'import'],
    ['Forms', 'forms', 'scratch'],
    ['Home', 'home', 'scratch'],
    ['Builder', 'builder', 'scratch'],
  ] as const)(
    'does not show the Download format control on the %s view',
    async (_name, view, mode) => {
      api.getDigitalForms.mockResolvedValue([exportForm])
      render(
        <DisplayLabelsProvider>
          <CollectionWorkspace initialView={view} initialMode={mode} />
        </DisplayLabelsProvider>,
      )
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
      await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
      expect(screen.queryByText('Download format')).toBeNull()
      expect(screen.queryByLabelText('Download format')).toBeNull()
    },
  )

  it('does not request an export without forms.export', async () => {
    currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
      (permission) => permission !== 'forms.export',
    )
    api.getDigitalForms.mockResolvedValue([exportForm])
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(screen.getByText('Activity Entry')).toBeTruthy())
    const button = screen.queryByRole('button', { name: 'Export form' })
    if (button) fireEvent.click(button)
    expect(core.downloadCoreArtifact).not.toHaveBeenCalled()
  })
})

describe('forms.generate action', () => {
  const source = {
    id: 'form-source',
    projectId: 'futuremakers-ncr',
    code: 'baseline',
    version: 1,
    name: 'Baseline',
    description: null,
    formType: 'OTHER',
    status: 'PUBLISHED',
    activityId: null,
    journeyStageId: null,
    updatedAt: '2026-09-28T00:00:00Z',
    createdByCurrentUser: false,
    fields: [
      {
        code: 'score',
        label: 'Score',
        dataType: 'INTEGER',
        required: true,
        metadataKey: false,
        sadddField: false,
      },
    ],
  }
  const renderBuilder = () =>
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialProjectId="futuremakers-ncr"
          initialFormId="form-source"
          initialView="builder"
        />
      </DisplayLabelsProvider>,
    )

  it('hides Generate copy without forms.generate', async () => {
    api.getDigitalForms.mockResolvedValue([source])
    renderBuilder()
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Baseline'),
    )
    expect(screen.queryByRole('button', { name: 'Generate copy' })).toBeNull()
  })

  it('generates a draft copy from the open form through the API', async () => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'forms.generate']
    api.getDigitalForms.mockResolvedValue([source])
    api.generateDigitalForm.mockResolvedValue({
      ...source,
      id: 'form-generated',
      code: 'baseline_copy_x',
      name: 'Baseline (copy)',
      status: 'DRAFT',
    })
    renderBuilder()
    fireEvent.click(await screen.findByRole('button', { name: 'Generate copy' }))
    await waitFor(() => expect(api.generateDigitalForm).toHaveBeenCalledOnce())
    expect(api.generateDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      expect.objectContaining({ sourceFormId: 'form-source', name: 'Baseline (copy)' }),
    )
    expect(api.generateDigitalForm.mock.calls[0]?.[1].code).toMatch(/^baseline_copy_[a-z0-9]+$/)
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Generated draft form Baseline (copy).'),
    )
    expect(screen.queryByText('Generated draft form Baseline (copy).')).toBeNull()
  })
})
