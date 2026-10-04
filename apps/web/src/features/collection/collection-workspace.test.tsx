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

vi.mock('@/lib/services/core-feature-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/core-feature-client')>()),
  downloadCoreArtifact: core.downloadCoreArtifact,
}))

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    getProjectsForRole: api.getProjectsForRole,
    getDigitalForms: api.getDigitalForms,
    getActivities: api.getActivities,
    getIndicators: api.getIndicators,
    createDigitalForm: api.createDigitalForm,
    createDigitalFormVersion: api.createDigitalFormVersion,
    generateDigitalForm: api.generateDigitalForm,
    publishDigitalForm: api.publishDigitalForm,
    updateDigitalForm: api.updateDigitalForm,
    uploadImport: api.uploadImport,
    automaticImportMapping: api.automaticImportMapping,
    getImportBatch: api.getImportBatch,
    saveImportMapping: api.saveImportMapping,
    validateImport: api.validateImport,
    processImport: api.processImport,
    getDigitalForm: api.getDigitalForm,
  },
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

const processedBatch = (id: string) => ({
  id,
  status: 'PROCESSED',
  totals: { rows: 1, valid: 1, invalid: 0, processed: 1, unprocessed: 0, failed: 0 },
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
  it('does not offer the retired Encode data link', () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )
    expect(screen.queryByRole('link', { name: /Encode/i })).toBeNull()
  })

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

  it('submits the server column keys instead of display headers for dataset mapping', async () => {
    api.getDigitalForms.mockResolvedValue([
      {
        id: 'published-form',
        projectId: 'futuremakers-ncr',
        code: 'attendance',
        name: 'Attendance',
        version: 1,
        formType: 'OTHER',
        status: 'PUBLISHED',
        updatedAt: '2026-09-22T00:00:00Z',
        activityId: null,
        journeyStageId: null,
        fields: [
          {
            code: 'beneficiary_id',
            label: 'Beneficiary ID',
            dataType: 'TEXT',
            required: true,
            metadataKey: true,
            sadddField: false,
          },
          {
            code: 'attendance_status',
            label: 'Attendance status',
            dataType: 'SELECT',
            required: true,
            metadataKey: false,
            sadddField: false,
            allowedValues: ['Present'],
          },
        ],
      },
    ])
    api.uploadImport.mockResolvedValue({ id: 'batch-1', mappingRevision: 0 })
    api.getImportBatch.mockResolvedValue({
      sourceColumns: [
        { key: 'column_0001', columnIndex: 1, header: 'Beneficiary ID' },
        { key: 'column_0002', columnIndex: 2, header: 'Attendance status' },
      ],
    })
    api.saveImportMapping.mockResolvedValue({ id: 'batch-1', mappingRevision: 1 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 1,
      validationRevision: 1,
      totals: { invalid: 0 },
    })
    api.processImport.mockResolvedValue(processedBatch('batch-1'))
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="import"
          initialProjectId="futuremakers-ncr"
          initialFormId="published-form"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [
          csvFile(
            'attendance.csv',
            async () => 'Beneficiary ID,Attendance status\nBEN-001,Present',
          ),
        ],
      },
    })
    await screen.findByText(/Preview ready for attendance.csv/)
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
    await waitFor(() => expect(api.saveImportMapping).toHaveBeenCalled())
    expect(api.saveImportMapping).toHaveBeenCalledWith('futuremakers-ncr', 'batch-1', 0, [
      { sourceFieldName: 'column_0001', targetFieldCode: 'beneficiary_id', ignored: false },
      { sourceFieldName: 'column_0002', targetFieldCode: 'attendance_status', ignored: false },
    ])
  })

  it('keeps a wide, many-row extend-mode preview inside its own scroll container with a capped row count', async () => {
    const columnCount = 12
    const rowCount = 40
    const headers = Array.from({ length: columnCount }, (_, index) => `Source column ${index + 1}`)
    const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
      headers
        .map((_, columnIndex) => `row-${rowIndex + 1}-col-${columnIndex + 1}-${'x'.repeat(40)}`)
        .join(','),
    )
    const csvText = `${headers.join(',')}\n${rows.join('\n')}`

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [csvFile('wide-extend.csv', async () => csvText)],
      },
    })
    await screen.findByText(/Preview ready for wide-extend.csv/)

    // The read-only Data preview is capped, not rendering every one of the 40 source rows.
    await screen.findByText(
      new RegExp(`Showing the first 5 of ${rowCount} rows for mapping and validation review`),
    )
    const previewRegion = screen.getByRole('region', { name: 'Data preview rows' })
    expect(previewRegion.className).toContain('overflow-x-auto')
    expect(previewRegion.className).toContain('max-w-full')
    expect(previewRegion.getAttribute('tabIndex')).toBe('0')
    expect(within(previewRegion).getAllByRole('row')).toHaveLength(1 + 5)

    // The mapping table for the same wide file is also its own scroll container.
    const mappingRegion = screen.getByRole('region', { name: 'Metadata mapping rows' })
    expect(mappingRegion.className).toContain('overflow-x-auto')
    expect(mappingRegion.className).toContain('max-w-full')
    expect(mappingRegion.getAttribute('tabIndex')).toBe('0')
  })

  it('paginates the editable correction table instead of capping it, and keeps edits across pages', async () => {
    const rowCount = 40
    const headers = ['beneficiary_id', 'attendance_status', 'note']
    const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
      headers.map((_, columnIndex) => `row-${rowIndex + 1}-col-${columnIndex + 1}`).join(','),
    )
    const csvText = `${headers.join(',')}\n${rows.join('\n')}`

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [csvFile('correction.csv', async () => csvText)],
      },
    })
    await screen.findByText(/Preview ready for correction.csv/)

    fireEvent.click(screen.getByText('Correct isolated data before reprocessing'))
    const correctionRegion = screen.getByRole('region', {
      name: 'Isolated data rows awaiting correction',
    })
    expect(correctionRegion.className).toContain('overflow-x-auto')
    expect(correctionRegion.className).toContain('max-w-full')
    expect(correctionRegion.getAttribute('tabIndex')).toBe('0')

    // Page 1 shows rows 1-25, all correctable (not capped at MAX_PREVIEW_ROWS).
    expect(screen.getByText('Rows 1-25 of 40')).toBeTruthy()
    expect(within(correctionRegion).getAllByRole('row')).toHaveLength(25)
    expect(screen.getByLabelText('Row 1: beneficiary_id')).toBeTruthy()
    expect(screen.getByLabelText('Row 25: note')).toBeTruthy()
    expect(screen.queryByLabelText('Row 26: beneficiary_id')).toBeNull()
    const previousButton = screen.getByRole('button', { name: 'Previous' })
    expect((previousButton as HTMLButtonElement).disabled).toBe(true)

    // Editing a cell on page 2 must reach the underlying row state (the reprocess payload).
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Rows 26-40 of 40')).toBeTruthy()
    expect(within(correctionRegion).getAllByRole('row')).toHaveLength(15)
    const rowThirtyField = screen.getByLabelText('Row 30: note') as HTMLInputElement
    fireEvent.change(rowThirtyField, { target: { value: 'corrected-note-30' } })
    expect(rowThirtyField.value).toBe('corrected-note-30')

    // Going back to page 1 and returning to page 2 keeps the edit (rows live in shared state).
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Rows 1-25 of 40')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Rows 26-40 of 40')).toBeTruthy()
    expect((screen.getByLabelText('Row 30: note') as HTMLInputElement).value).toBe(
      'corrected-note-30',
    )

    const nextButton = screen.getByRole('button', { name: 'Next' })
    expect((nextButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('reuses the same import id after an uncertain upload and starts a new id for a new file', async () => {
    const definition = {
      id: 'published-form',
      projectId: 'futuremakers-ncr',
      code: 'attendance',
      name: 'Attendance',
      version: 1,
      formType: 'OTHER',
      status: 'PUBLISHED',
      updatedAt: '2026-09-22T00:00:00Z',
      activityId: null,
      journeyStageId: null,
      fields: [
        {
          code: 'beneficiary_id',
          label: 'Beneficiary ID',
          dataType: 'TEXT',
          required: true,
          metadataKey: true,
          sadddField: false,
        },
      ],
    }
    api.getDigitalForms.mockResolvedValue([definition])
    api.uploadImport
      .mockRejectedValueOnce(new Error('Upload response was lost.'))
      .mockResolvedValue({ id: 'staged-batch', mappingRevision: 0, storageStatus: 'STORED' })
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="import"
          initialProjectId="futuremakers-ncr"
          initialFormId="published-form"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
    const file = csvFile(
      'uncertain.csv',
      async () => 'beneficiary_id,unknown_column\nBEN-001,value',
    )
    fireEvent.change(screen.getByLabelText('Source file'), { target: { files: [file] } })
    await screen.findByText(/Preview ready for uncertain.csv/)
    const proceed = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
    }
    proceed()
    await screen.findByText('Upload response was lost.')
    proceed()
    await screen.findByText(
      'Import staged-batch was staged. Unresolved mappings and processing require an authorized reviewer.',
    )
    expect(api.uploadImport).toHaveBeenCalledTimes(2)
    const firstId = api.uploadImport.mock.calls[0][2]
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.uploadImport.mock.calls[1]).toEqual([
      'futuremakers-ncr',
      'published-form',
      firstId,
      file,
    ])
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.processImport).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [csvFile('changed.csv', async () => 'beneficiary_id,unknown_column\nBEN-002,next')],
      },
    })
    await screen.findByText(/Preview ready for changed.csv/)
    proceed()
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(3))
    expect(api.uploadImport.mock.calls[2][2]).not.toBe(firstId)
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.processImport).not.toHaveBeenCalled()
  })

  it('stages an unresolved file but never invokes review, validation or processing from the pending mapping', async () => {
    api.getDigitalForms.mockResolvedValue([
      {
        id: 'published-form',
        projectId: 'futuremakers-ncr',
        code: 'attendance',
        name: 'Attendance',
        version: 1,
        formType: 'OTHER',
        status: 'PUBLISHED',
        updatedAt: '2026-09-22T00:00:00Z',
        activityId: null,
        journeyStageId: null,
        fields: [
          {
            code: 'beneficiary_id',
            label: 'Beneficiary ID',
            dataType: 'TEXT',
            required: true,
            metadataKey: true,
            sadddField: false,
          },
        ],
      },
    ])
    api.uploadImport.mockResolvedValue({
      id: 'staged-batch',
      mappingRevision: 0,
      storageStatus: 'STORED',
    })
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="import"
          initialProjectId="futuremakers-ncr"
          initialFormId="published-form"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [csvFile('pending.csv', async () => 'beneficiary_id,unknown_column\nBEN-001,value')],
      },
    })
    await screen.findByText(
      'This file can be uploaded to staging. An authorized reviewer must resolve unmatched columns before validation and processing.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
    await screen.findByText(
      'Import staged-batch was staged. Unresolved mappings and processing require an authorized reviewer.',
    )
    expect(api.uploadImport).toHaveBeenCalledOnce()
    expect(api.automaticImportMapping).toHaveBeenCalledWith('futuremakers-ncr', 'staged-batch', 0)
    expect(api.getImportBatch).not.toHaveBeenCalled()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.processImport).not.toHaveBeenCalled()
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

  it('uses one visible labelled chooser and reports reading, completion, and mapping readiness', async () => {
    renderImportWorkspace()
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

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

  it('permits staging pending mappings and retains prior work through a failed read and retry', async () => {
    renderImportWorkspace()
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

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
        screen.getByText(
          'This file can be uploaded to staging. An authorized reviewer must resolve unmatched columns before validation and processing.',
        ),
      ).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(false)

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

  it('shows the fetched project selection even when options arrive after the initial render', async () => {
    let resolveProjects: ((value: Array<{ id: string; title: string }>) => void) | undefined
    api.getProjectsForRole.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProjects = resolve
        }),
    )
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await act(async () => {
      resolveProjects?.([{ id: 'futuremakers-ncr', title: 'Futuremakers NCR' }])
    })
    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    await waitFor(() =>
      expect(within(projectField()).getByRole('combobox').textContent).toContain(
        'Futuremakers NCR',
      ),
    )
  })

  it('shows the fetched projects again on a second mount (a cached list on remount)', async () => {
    api.getProjectsForRole.mockResolvedValue([
      { id: 'futuremakers-ncr', title: 'Futuremakers NCR' },
    ])
    const { unmount } = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    unmount()
    api.getProjectsForRole.mockClear()

    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialView="import"
          initialMode="extend"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    await waitFor(() =>
      expect(within(projectField()).getByRole('combobox').textContent).toContain(
        'Futuremakers NCR',
      ),
    )
  })

  it('keeps the auto-selected project when the profile permission list is rebuilt in a different order', async () => {
    api.getProjectsForRole.mockResolvedValue([
      { id: 'futuremakers-ncr', title: 'Futuremakers NCR' },
      { id: 'second-project', title: 'Second Project' },
    ])
    const { rerender } = render(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())

    const projectField = () => screen.getByText('Project selection').closest('div') as HTMLElement
    const trigger = () => within(projectField()).getByRole('combobox')
    await waitFor(() => expect(trigger().textContent).toContain('Futuremakers NCR'))

    // The auth layer rebuilds the permission list with the same permissions in a
    // different order (e.g. after a token refresh merges grants from two sources).
    // Because the permission set is unchanged, the workspace must not remount and
    // drop the already-selected project.
    currentAccess.profile.permissions = [...currentAccess.profile.permissions].reverse()
    rerender(
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="import" initialMode="extend" />
      </DisplayLabelsProvider>,
    )

    expect(trigger().textContent).toContain('Futuremakers NCR')
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

describe('collection permission integration', () => {
  it('keeps Project Officer on standard Import and avoids builder-only dependencies', async () => {
    currentAccess.role = 'Project Officer'
    currentAccess.profile.roles = ['PROJECT_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'collection.read',
      'forms.read',
      'forms.export',
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
      'forms.export',
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const ownedDataset = async () => {
  api.getDigitalForms.mockResolvedValue([
    {
      id: 'published-form',
      projectId: 'futuremakers-ncr',
      code: 'attendance',
      name: 'Attendance',
      version: 1,
      formType: 'OTHER',
      status: 'PUBLISHED',
      updatedAt: '2026-09-22T00:00:00Z',
      activityId: null,
      journeyStageId: null,
      fields: [
        {
          code: 'beneficiary_id',
          label: 'Beneficiary ID',
          dataType: 'TEXT',
          required: true,
          metadataKey: true,
          sadddField: false,
        },
      ],
    },
  ])
  api.getImportBatch.mockResolvedValue({
    sourceColumns: [{ key: 'column_0001', columnIndex: 1, header: 'beneficiary_id' }],
  })
  api.saveImportMapping.mockResolvedValue({ id: 'batch-owned', mappingRevision: 1 })
  api.validateImport.mockResolvedValue({
    id: 'batch-owned',
    mappingRevision: 1,
    validationRevision: 1,
    totals: { invalid: 0 },
  })
  api.processImport.mockResolvedValue(processedBatch('batch-owned'))
  const element = () => (
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialMode="import"
        initialView="import"
        initialProjectId="futuremakers-ncr"
        initialFormId="published-form"
      />
    </DisplayLabelsProvider>
  )
  const view = render(element())
  await waitFor(() =>
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
  )
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [csvFile('owned.csv', async () => 'beneficiary_id\nBEN-OWNER')] },
  })
  await screen.findByText(/Preview ready for owned.csv/)
  fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
  const submit = within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' })
  return { view, element, submit }
}
describe('collection operation ownership', () => {
  it.each([
    'actor',
    'organization',
    'assignment',
    'permission',
    'project',
    'form',
    'unmount',
  ] as const)('stops a delayed upload after %s invalidation', async (reason) => {
    const pending = deferred<{ id: string; mappingRevision: number }>()
    api.uploadImport.mockReturnValue(pending.promise)
    const { view, element, submit } = await ownedDataset()
    fireEvent.click(submit)
    expect(api.uploadImport).toHaveBeenCalledOnce()
    if (reason === 'unmount') view.unmount()
    else if (reason === 'project' || reason === 'form')
      view.rerender(
        <DisplayLabelsProvider>
          <CollectionWorkspace
            initialView="import"
            initialMode="import"
            initialProjectId={reason === 'project' ? 'another-project' : 'futuremakers-ncr'}
            initialFormId={reason === 'form' ? 'another-form' : 'published-form'}
          />
        </DisplayLabelsProvider>,
      )
    else {
      if (reason === 'actor') currentAccess.profile.userId = 'actor-b'
      if (reason === 'organization') currentAccess.profile.organizationId = 'org-b'
      if (reason === 'assignment') currentAccess.profile.assignedProjectIds = []
      if (reason === 'permission')
        currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
          (p) => p !== 'imports.review',
        )
      view.rerender(element())
    }
    await act(async () => pending.resolve({ id: 'batch-owned', mappingRevision: 0 }))
    expect(api.getImportBatch).not.toHaveBeenCalled()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    expect(api.validateImport).not.toHaveBeenCalled()
    expect(api.processImport).not.toHaveBeenCalled()
  })
  it.each(['mapping', 'validation'] as const)(
    'rechecks permission after delayed %s',
    async (stage) => {
      api.uploadImport.mockResolvedValue({ id: 'batch-owned', mappingRevision: 0 })
      const { view, element, submit } = await ownedDataset()
      const pending = deferred<unknown>()
      if (stage === 'mapping') api.saveImportMapping.mockReturnValue(pending.promise)
      else api.validateImport.mockReturnValue(pending.promise)
      fireEvent.click(submit)
      await waitFor(() =>
        expect(
          stage === 'mapping' ? api.saveImportMapping : api.validateImport,
        ).toHaveBeenCalledOnce(),
      )
      currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
        (p) => p !== (stage === 'mapping' ? 'imports.validate' : 'imports.process'),
      )
      view.rerender(element())
      await act(async () =>
        pending.resolve(
          stage === 'mapping'
            ? { id: 'batch-owned', mappingRevision: 1 }
            : {
                id: 'batch-owned',
                mappingRevision: 1,
                validationRevision: 1,
                totals: { invalid: 0 },
              },
        ),
      )
      if (stage === 'mapping') expect(api.validateImport).not.toHaveBeenCalled()
      expect(api.processImport).not.toHaveBeenCalled()
    },
  )
  it('continues one-shot processing until the server reports the batch done', async () => {
    api.uploadImport.mockResolvedValue({ id: 'batch-owned', mappingRevision: 0 })
    const partial = (processed: number) => ({
      id: 'batch-owned',
      status: processed >= 250 ? 'PROCESSED' : 'PARTIALLY_PROCESSED',
      totals: { rows: 250, valid: 250, invalid: 0, processed, unprocessed: 0, failed: 0 },
    })
    api.processImport
      .mockResolvedValueOnce(partial(100))
      .mockResolvedValueOnce(partial(200))
      .mockResolvedValueOnce(partial(250))
    const { submit } = await ownedDataset()
    fireEvent.click(submit)

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'Server import batch-owned: 250 processed, 0 failed.',
      ),
    )
    expect(api.processImport).toHaveBeenCalledTimes(3)
    expect(api.processImport).toHaveBeenCalledWith('futuremakers-ncr', 'batch-owned', 1)
  })
  it('keeps the dialog open with Resume processing after a failed processing call', async () => {
    api.uploadImport.mockResolvedValue({ id: 'batch-owned', mappingRevision: 0 })
    api.processImport
      .mockResolvedValueOnce({
        id: 'batch-owned',
        status: 'PARTIALLY_PROCESSED',
        totals: { rows: 250, valid: 250, invalid: 0, processed: 100, unprocessed: 0, failed: 0 },
      })
      .mockRejectedValueOnce(new Error('Another worker currently owns this import claim.'))
    const { submit } = await ownedDataset()
    fireEvent.click(submit)

    const dialog = screen.getByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('status').textContent).toContain(
        'Processing paused: 100 of 250 rows handled',
      ),
    )
    // Proceed unmounted; focus moved into the processing panel (heading, then Resume).
    expect(
      within(dialog).getByTestId('import-processing-panel').contains(document.activeElement),
    ).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Resume processing' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Proceed' })).toBeNull()
  })
  it('keeps one upload ticket and immutable inputs across duplicate clicks and a same-scope refresh', async () => {
    const pending = deferred<{ id: string; mappingRevision: number }>()
    api.uploadImport.mockReturnValue(pending.promise)
    const { view, element, submit } = await ownedDataset()
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.change(screen.getByLabelText('Form title'), {
      target: { value: 'Injected change' },
    })
    currentAccess.profile = {
      ...currentAccess.profile,
      permissions: [...currentAccess.profile.permissions],
    }
    view.rerender(element())
    expect(api.uploadImport).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance')
    await act(async () => pending.resolve({ id: 'batch-owned', mappingRevision: 0 }))
    await waitFor(() => expect(api.processImport).toHaveBeenCalledOnce())
  })
  it.each(['success', 'failure'] as const)(
    'ignores older file read %s after a newer selection',
    async (outcome) => {
      renderImportWorkspace()
      await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
      const old = deferred<string>()
      fireEvent.change(screen.getByLabelText('Source file'), {
        target: { files: [csvFile('old.csv', () => old.promise)] },
      })
      fireEvent.change(screen.getByLabelText('Source file'), {
        target: { files: [csvFile('new.csv', async () => 'beneficiary_id\nCURRENT')] },
      })
      await screen.findByText(/Preview ready for new.csv/)
      await act(async () => {
        if (outcome === 'success') old.resolve('beneficiary_id\nSTALE')
        else old.reject(new Error('Old failure'))
      })
      expect(screen.getByText(/Preview ready for new.csv/)).toBeTruthy()
      expect(screen.queryByText('STALE')).toBeNull()
      expect(screen.queryByText(/Old failure/)).toBeNull()
    },
  )
  it('does not show a stale form-save completion after organization changes', async () => {
    const pending = deferred<unknown>()
    api.createDigitalForm.mockReturnValue(pending.promise)
    const element = () => (
      <DisplayLabelsProvider>
        <CollectionWorkspace initialView="builder" initialProjectId="futuremakers-ncr" />
      </DisplayLabelsProvider>
    )
    const view = render(element())
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }))
    expect(api.createDigitalForm).toHaveBeenCalledOnce()
    currentAccess.profile.organizationId = 'org-b'
    view.rerender(element())
    await act(async () =>
      pending.resolve({
        id: 'old-form',
        projectId: 'futuremakers-ncr',
        name: 'Old saved form',
        fields: [],
        updatedAt: 'old',
      }),
    )
    expect(toasts.success).not.toHaveBeenCalledWith('Draft saved to the server.')
    expect(screen.queryByText('Old saved form')).toBeNull()
  })
})

describe('persisted collection completion ownership', () => {
  it.each(['export', 'publish', 'version'] as const)(
    'rejects stale %s completion after an actor switch',
    async (operation) => {
      if (operation === 'publish') {
        currentAccess.role = 'System Administrator'
        currentAccess.profile.roles = ['SYSTEM_ADMINISTRATOR']
      }
      const form = {
        id: 'form-owned',
        projectId: 'futuremakers-ncr',
        code: 'owned',
        version: 1,
        name: 'Owned definition',
        description: null,
        formType: 'OTHER',
        status: operation === 'publish' ? 'DRAFT' : 'PUBLISHED',
        activityId: null,
        journeyStageId: null,
        updatedAt: '2026-09-23T00:00:00Z',
        createdByCurrentUser: false,
        fields: [
          {
            code: 'beneficiary_id',
            label: 'Beneficiary ID',
            dataType: 'TEXT',
            required: true,
            metadataKey: true,
            sadddField: false,
          },
        ],
      }
      api.getDigitalForms.mockResolvedValue([form])
      const pending = deferred<unknown>()
      const apiCall =
        operation === 'export'
          ? core.downloadCoreArtifact
          : operation === 'publish'
            ? api.publishDigitalForm
            : api.createDigitalFormVersion
      if (operation === 'export')
        core.downloadCoreArtifact.mockImplementation(
          async (_url: string, _fileName: string, isOwnerCurrent: () => boolean) => {
            await pending.promise
            if (!isOwnerCurrent()) throw new Error('Artifact ownership changed.')
            URL.createObjectURL(new Blob(['artifact']))
            document.createElement('a').click()
          },
        )
      else apiCall.mockReturnValue(pending.promise)
      const create = vi.fn(() => 'blob:should-not-exist')
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
      const download = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined)
      const element = () => (
        <DisplayLabelsProvider>
          <CollectionWorkspace
            initialProjectId="futuremakers-ncr"
            initialFormId={operation === 'export' ? undefined : 'form-owned'}
            initialView={operation === 'export' ? 'forms' : 'builder'}
          />
        </DisplayLabelsProvider>
      )
      const view = render(element())
      if (operation === 'export') await screen.findByText('Owned definition')
      else
        await waitFor(() =>
          expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe(
            'Owned definition',
          ),
        )
      fireEvent.click(
        screen.getByRole('button', {
          name:
            operation === 'export'
              ? 'Export form'
              : operation === 'publish'
                ? 'Publish saved draft'
                : 'Create new version',
        }),
      )
      await waitFor(() => expect(apiCall).toHaveBeenCalledOnce())
      currentAccess.profile.userId = 'actor-b'
      api.getDigitalForms.mockResolvedValue([])
      view.rerender(element())
      await act(async () => pending.resolve({ ...form, id: 'late-definition' }))
      expect(create).not.toHaveBeenCalled()
      expect(download).not.toHaveBeenCalled()
      expect(toasts.success).not.toHaveBeenCalledWith('Form published to the server.')
      expect(toasts.success).not.toHaveBeenCalledWith('A new draft version is ready for editing.')
    },
  )
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

describe('collection initial file ownership readiness', () => {
  it('disables the source chooser until the selected definition revision is ready', async () => {
    const pending = deferred<unknown[]>()
    api.getDigitalForms.mockReturnValue(pending.promise)
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialMode="import"
          initialView="import"
          initialProjectId="futuremakers-ncr"
          initialFormId="waiting-form"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    const input = screen.getByLabelText('Source file') as HTMLInputElement
    expect(input.disabled).toBe(true)
    const read = vi.fn(async () => 'beneficiary_id\nEARLY')
    fireEvent.change(input, { target: { files: [csvFile('early.csv', read)] } })
    expect(read).not.toHaveBeenCalled()
    await act(async () =>
      pending.resolve([
        {
          id: 'waiting-form',
          projectId: 'futuremakers-ncr',
          code: 'waiting',
          name: 'Ready definition',
          version: 1,
          formType: 'OTHER',
          status: 'PUBLISHED',
          updatedAt: '2026-09-22T00:00:00Z',
          activityId: null,
          journeyStageId: null,
          fields: [
            {
              code: 'beneficiary_id',
              label: 'Beneficiary ID',
              dataType: 'TEXT',
              required: true,
              metadataKey: true,
              sadddField: false,
            },
          ],
        },
      ]),
    )
    await waitFor(() => expect(input.disabled).toBe(false))
    fireEvent.change(input, { target: { files: [csvFile('ready.csv', read)] } })
    expect(await screen.findByText(/Preview ready for ready.csv/)).toBeTruthy()
  })
})

describe('collection conservative uploader mapping', () => {
  it.each([true, false])(
    'stages PO data with automatic complete=%s without reviewer calls',
    async (complete) => {
      currentAccess.role = 'Project Officer'
      currentAccess.profile.roles = ['PROJECT_OFFICER']
      currentAccess.profile.permissions = [
        'projects.read',
        'collection.read',
        'forms.read',
        'imports.upload',
        'imports.read',
      ]
      api.uploadImport.mockResolvedValue({
        id: 'batch-owned',
        mappingRevision: 0,
        storageStatus: 'STORED',
      })
      api.automaticImportMapping.mockResolvedValue({
        batchId: 'batch-owned',
        mappingRevision: 1,
        mapped: complete ? 1 : 0,
        pending: complete ? 0 : 1,
        requiredUnmapped: complete ? 0 : 1,
        complete,
      })
      const { submit } = await ownedDataset()
      fireEvent.click(submit)
      await waitFor(() =>
        expect(api.automaticImportMapping).toHaveBeenCalledWith(
          'futuremakers-ncr',
          'batch-owned',
          0,
        ),
      )
      expect(await screen.findByText(/batch-owned was staged.*authorized reviewer/)).toBeTruthy()
      expect(api.saveImportMapping).not.toHaveBeenCalled()
      expect(api.validateImport).not.toHaveBeenCalled()
      expect(api.processImport).not.toHaveBeenCalled()
    },
  )
  it('stops after a delayed automatic mapping when upload authority is revoked', async () => {
    api.uploadImport.mockResolvedValue({
      id: 'batch-owned',
      mappingRevision: 0,
      storageStatus: 'STORED',
    })
    const pending = deferred<unknown>()
    api.automaticImportMapping.mockReturnValue(pending.promise)
    const { submit, view, element } = await ownedDataset()
    fireEvent.click(submit)
    await waitFor(() => expect(api.automaticImportMapping).toHaveBeenCalledOnce())
    currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
      (grant) => grant !== 'imports.upload',
    )
    view.rerender(element())
    await act(async () =>
      pending.resolve({
        batchId: 'batch-owned',
        mappingRevision: 1,
        mapped: 1,
        pending: 0,
        requiredUnmapped: 0,
        complete: true,
      }),
    )
    expect(api.getImportBatch).not.toHaveBeenCalled()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
  })
})
