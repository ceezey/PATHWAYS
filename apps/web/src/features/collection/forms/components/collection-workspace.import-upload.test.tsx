/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
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

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
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

const processedBatch = (id: string) => ({
  id,
  status: 'PROCESSED',
  totals: { rows: 1, valid: 1, invalid: 0, processed: 1, unprocessed: 0, failed: 0 },
})

const csvFile = (name: string, readText: () => Promise<string>) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: readText })
  return file
}

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

describe('collection import workspace', () => {
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

describe('collection upload identity', () => {
  const proceed = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Proceed' }))
  }
  const changes: Record<string, () => Promise<void>> = {
    nothing: async () => {},
    file: async () => {
      fireEvent.change(screen.getByLabelText('Source file'), {
        target: { files: [csvFile('changed.csv', async () => 'beneficiary_id\nBEN-OTHER')] },
      })
      await screen.findByText(/Preview ready for changed.csv/)
    },
    version: async () => {
      const [current] = await api.getDigitalForms.mock.results[0].value
      api.getDigitalForms.mockResolvedValue([{ ...current, version: 2 }])
      fireEvent.click(screen.getByRole('button', { name: 'Build forms' }))
      await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalledTimes(2))
      fireEvent.click(screen.getByRole('link', { name: /Import existing file/ }))
      await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalledTimes(3))
      await screen.findByText('Ready to proceed')
    },
    generation: async () => {
      await act(async () => clearSensitiveDraftStorage())
    },
  }
  it.each([
    ['nothing', true],
    ['file', false],
    ['version', false],
    ['generation', false],
  ])('after a lost upload, a change of %s reuses the import id: %s', async (part, reused) => {
    api.uploadImport.mockRejectedValue(new Error('Upload response was lost.'))
    const { submit } = await ownedDataset()
    fireEvent.click(submit)
    await screen.findByText('Upload response was lost.')
    await changes[part]()
    proceed()
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(2))
    const [first, second] = api.uploadImport.mock.calls
    expect(first[2]).toMatch(/^[0-9a-f-]{36}$/)
    expect(second[2] === first[2]).toBe(reused)
  })
})
