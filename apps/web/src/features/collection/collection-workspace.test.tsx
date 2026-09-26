/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  createDigitalForm: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForm: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
const currentAccess = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  assignedProjectIds: ['futuremakers-ncr'],
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'collection.read',
      'forms.read',
      'forms.manage',
      'forms.templates.import',
      'forms.publish',
      'submissions.write',
      'imports.read',
      'imports.upload',
      'imports.review',
      'imports.process',
    ],
    assignedProjectIds: ['futuremakers-ncr'],
  },
}))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => currentAccess,
}))

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    getProjectsForRole: api.getProjectsForRole,
    getDigitalForms: api.getDigitalForms,
    getActivities: api.getActivities,
    getIndicators: api.getIndicators,
    createDigitalForm: api.createDigitalForm,
    getDigitalForm: api.getDigitalForm,
  },
}))

beforeEach(() => {
  currentAccess.role = 'Monitoring and Evaluation Officer'
  currentAccess.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  currentAccess.profile.permissions = [
    'projects.read',
    'activities.read',
    'monitoring.read',
    'collection.read',
    'forms.read',
    'forms.manage',
    'forms.templates.import',
    'forms.publish',
    'submissions.write',
    'imports.read',
    'imports.upload',
    'imports.review',
    'imports.process',
  ]
  api.getProjectsForRole.mockResolvedValue([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
  api.getDigitalForms.mockResolvedValue([])
  api.getActivities.mockResolvedValue([])
  api.getIndicators.mockResolvedValue([])
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
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }))
    const dialog = screen.getByRole('dialog', { name: 'Create draft form?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Draft' }))

    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalled())
    expect(await screen.findByText(/Draft form .* created on the server/)).toBeTruthy()
    expect(api.createDigitalForm).toHaveBeenCalledWith(
      'futuremakers-ncr',
      expect.objectContaining({
        name: 'Youth Skills Assessment Form',
        fields: expect.arrayContaining([expect.objectContaining({ code: 'beneficiary_id' })]),
      }),
    )
  })

  it('uses one visible labelled chooser and reports reading, completion, and mapping readiness', async () => {
    renderImportWorkspace()

    const chooser = screen.getByLabelText('Source file') as HTMLInputElement
    const helpId = chooser.getAttribute('aria-describedby')
    expect(chooser.type).toBe('file')
    expect(chooser.className).not.toContain('sr-only')
    expect(helpId).toBe('collection-import-file-help')
    expect(document.getElementById(helpId ?? '')?.textContent).toContain(
      'Choose one CSV, XLS, or XLSX file.',
    )

    chooser.focus()
    expect(document.activeElement).toBe(chooser)

    let resolveText: ((value: string) => void) | undefined
    const file = csvFile(
      'valid.csv',
      () =>
        new Promise<string>((resolve) => {
          resolveText = resolve
        }),
    )
    fireEvent.change(chooser, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Reading the selected file.')).toBeTruthy()
    })
    expect(
      screen
        .getByRole('progressbar', { name: 'File reading progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('28')
    expect(document.activeElement).toBe(chooser)

    await act(async () => {
      resolveText?.('beneficiary_id,attendance_status\nBEN-001,Present')
    })

    await waitFor(() => {
      expect(screen.getByText(/Preview ready for valid\.csv/)).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('All 2 source columns are resolved. You can proceed.')).toBeTruthy()
    expect(document.querySelectorAll('[aria-live]').length).toBe(1)
    expect(
      screen
        .getByRole('progressbar', { name: 'File reading progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('100')
  })

  it('blocks unresolved mappings and retains prior work through a failed read and retry', async () => {
    renderImportWorkspace()

    const chooser = screen.getByLabelText('Source file') as HTMLInputElement
    fireEvent.change(chooser, {
      target: {
        files: [
          csvFile('unmapped.csv', async () => 'beneficiary_id,unknown_column\nBEN-001,value'),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByText('1 unmapped source column remains. Resolve them before proceeding.'),
      ).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(true)

    fireEvent.change(chooser, {
      target: {
        files: [csvFile('valid.csv', async () => 'beneficiary_id\nBEN-001')],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/Preview ready for valid\.csv/)).toBeTruthy()
    })
    expect(screen.getByText('BEN-001')).toBeTruthy()

    const transientRead = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Temporary read failure.'))
      .mockResolvedValue('beneficiary_id\nBEN-002')
    chooser.focus()
    fireEvent.change(chooser, {
      target: { files: [csvFile('retry.csv', transientRead)] },
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          /Temporary read failure\..*previous preview and mapping work are retained/i,
        ),
      ).toBeTruthy()
    })
    expect(document.activeElement).toBe(chooser)
    expect(screen.getByText('BEN-001')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Retry reading file' }))
    await waitFor(() => {
      expect(screen.getByText(/Preview ready for retry\.csv/)).toBeTruthy()
    })
    expect(transientRead).toHaveBeenCalledTimes(2)
    expect(screen.getByText('BEN-002')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(false)
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
  it('downloads an exact persisted CSV and creates no file for unsupported formats', async () => {
    const form = {
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
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    const createObjectURL = vi.fn(() => 'blob:form-export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="forms" />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(screen.getByText('Activity Entry')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Export form' }))
    await waitFor(() =>
      expect(api.getDigitalForm).toHaveBeenCalledWith('futuremakers-ncr', 'form-1'),
    )
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:form-export')

    fireEvent.change(screen.getByLabelText('Download format'), { target: { value: 'xlsx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export form' }))
    expect(api.getDigitalForm).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('collection permission integration', () => {
  it('keeps Project Officer on standard Import and avoids builder-only dependencies', async () => {
    currentAccess.role = 'Project Officer'
    currentAccess.profile.roles = ['PROJECT_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'collection.read',
      'forms.read',
      'submissions.write',
      'imports.read',
      'imports.upload',
    ]

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    expect(screen.getByText('Import existing file')).toBeTruthy()
    expect(screen.queryByText('Build forms')).toBeNull()
    expect(screen.queryByText('Import then extend')).toBeNull()
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
  })

  it('denies Program Manager form access even with stale legacy grants', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'monitoring.read',
      'collection.read',
      'forms.read',
    ]

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )

    await waitFor(() => expect(screen.queryByText('Build forms')).toBeNull())
    expect(api.getDigitalForms).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Forms' })).toBeNull()
    expect(screen.queryByText('Build forms')).toBeNull()
    expect(screen.queryByText('Import existing file')).toBeNull()
    expect(screen.queryByText('Import then extend')).toBeNull()
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
  })
})
