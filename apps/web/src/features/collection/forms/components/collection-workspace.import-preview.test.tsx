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
  it('does not offer the retired Encode data link', () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace />
      </DisplayLabelsProvider>,
    )
    expect(screen.queryByRole('link', { name: /Encode/i })).toBeNull()
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
})
