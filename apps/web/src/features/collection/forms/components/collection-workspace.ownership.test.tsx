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
  it('stops after the in-flight processing call and resumes from the same batch', async () => {
    api.uploadImport.mockResolvedValue({ id: 'batch-owned', mappingRevision: 0 })
    const partial = (processed: number) => ({
      id: 'batch-owned',
      status: processed >= 250 ? 'PROCESSED' : 'PARTIALLY_PROCESSED',
      totals: { rows: 250, valid: 250, invalid: 0, processed, unprocessed: 0, failed: 0 },
    })
    const first = deferred<ReturnType<typeof partial>>()
    api.processImport
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(partial(200))
      .mockResolvedValueOnce(partial(250))
    const { submit } = await ownedDataset()
    fireEvent.click(submit)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Stop processing' }))
    await act(async () => first.resolve(partial(100)))
    await waitFor(() =>
      expect(within(dialog).getByRole('status').textContent).toContain(
        'Processing stopped: 100 of 250 rows handled',
      ),
    )
    expect(api.processImport).toHaveBeenCalledOnce()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume processing' }))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'Server import batch-owned: 250 processed, 0 failed.',
      ),
    )
    expect(api.processImport).toHaveBeenCalledTimes(3)
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
