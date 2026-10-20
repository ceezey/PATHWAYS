/* @vitest-environment jsdom */

import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const csvFile = (name: string, text: string) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: async () => text })
  return file
}
const attendance = {
  id: 'published-form',
  projectId: 'futuremakers-ncr',
  code: 'attendance',
  name: 'Attendance',
  version: 1,
  formType: 'OTHER',
  status: 'PUBLISHED',
  updatedAt: stamp,
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
const totals = { rows: 2, valid: 2, invalid: 0, processed: 0, unprocessed: 2, failed: 0 }
const openImport = async (fileName: string, text: string, formId?: string) => {
  render(
    <DisplayLabelsProvider>
      <CollectionWorkspace
        initialMode="import"
        initialView="import"
        initialProjectId="futuremakers-ncr"
        initialFormId={formId}
      />
    </DisplayLabelsProvider>,
  )
  if (formId)
    await waitFor(() =>
      expect((screen.getByLabelText('Form title') as HTMLInputElement).value).toBe('Attendance'),
    )
  else await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [csvFile(fileName, text)] },
  })
  await screen.findByText(/ready for/)
}
const confirmDialog = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))
}
const stageDataset = (detail: object) => {
  api.getDigitalForms.mockResolvedValue([attendance])
  api.uploadImport.mockResolvedValue({ id: 'batch-1', mappingRevision: 0, storageStatus: 'STORED' })
  api.automaticImportMapping.mockResolvedValue({ mappingRevision: 2 })
  api.getImportBatch.mockResolvedValue(detail)
  api.saveImportMapping.mockResolvedValue({ id: 'batch-1', mappingRevision: 3 })
}
const column = { key: 'column_0001', columnIndex: 1, header: 'beneficiary_id' }

describe('collection import proceed', () => {
  it('asks for a published form before importing data rows', async () => {
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001')
    confirmDialog('Proceed')
    expect(
      await screen.findByText('Open a published form for this project before importing data.'),
    ).toBeTruthy()
    expect(api.uploadImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves the mapping at the newest revision the server reports', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 3 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 3,
      validationRevision: 1,
      totals,
    })
    api.processImport.mockResolvedValue({
      id: 'batch-1',
      status: 'PROCESSED',
      totals: { ...totals, processed: 2, unprocessed: 0 },
    })
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    await waitFor(() => expect(api.saveImportMapping).toHaveBeenCalled())
    expect(api.saveImportMapping.mock.calls[0]?.[2]).toBe(3)
  })

  it('stops before processing when the server finds invalid rows', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 0 })
    api.validateImport.mockResolvedValue({
      id: 'batch-9',
      mappingRevision: 3,
      validationRevision: 1,
      totals: { ...totals, invalid: 2 },
    })
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    expect(
      await screen.findByText(
        'Server validation found 2 invalid rows. Review batch batch-9 before processing.',
      ),
    ).toBeTruthy()
    expect(api.processImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    [
      'fewer columns than the file',
      [],
      'The server source columns could not be matched to the reviewed file.',
    ],
    [
      'a different header',
      [{ ...column, header: 'other_header' }],
      'The server source columns differ from the reviewed file. Review the batch before continuing.',
    ],
  ])(
    'refuses to save a mapping when the server stored %s',
    async (_name, sourceColumns, message) => {
      stageDataset({ sourceColumns, mappingRevision: 0 })
      await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
      confirmDialog('Proceed')
      expect(await screen.findByText(message)).toBeTruthy()
      expect(api.saveImportMapping).not.toHaveBeenCalled()
    },
  )

  it('keeps a failed processing run resumable and says how far it got when the dialog is closed', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 0 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 3,
      validationRevision: 1,
      totals,
    })
    api.processImport.mockRejectedValue(new Error('Server stopped'))
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(
      await screen.findByText(
        'Import batch-1 paused after 2 of 2 rows. Resume it from the Import workspace.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates a form from a header-only file with a code within 64 characters and opens the Forms list', async () => {
    api.createDigitalForm.mockImplementation(async (projectId, input) => {
      const created = { ...draft, ...input, id: 'created-form', projectId }
      api.getDigitalForms.mockResolvedValue([created])
      return created
    })
    const title = 'A very long questionnaire title that keeps going and going and going on and on'
    await openImport(`${title}.csv`, 'beneficiary_id,attendance_status')
    confirmDialog('Create draft')
    await waitFor(() => expect(api.createDigitalForm).toHaveBeenCalled())
    const code = api.createDigitalForm.mock.calls[0]?.[1].code as string
    expect(code).toHaveLength(64)
    expect(code).toMatch(/^a_very_long_questionnaire_title/)
    expect(await screen.findByRole('button', { name: 'Open form' })).toBeTruthy()
  })

  it('offers a fresh Proceed after a paused run was closed', async () => {
    stageDataset({ sourceColumns: [column], mappingRevision: 0 })
    api.validateImport.mockResolvedValue({
      id: 'batch-1',
      mappingRevision: 3,
      validationRevision: 1,
      totals,
    })
    api.processImport.mockRejectedValue(new Error('Server stopped'))
    await openImport('attendance.csv', 'beneficiary_id\nBEN-001', 'published-form')
    confirmDialog('Proceed')
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Resume processing' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Proceed' })).toBeTruthy()
  })

  it('shows the title taken from the file name in the builder after a header-only create', async () => {
    api.createDigitalForm.mockImplementation(async (projectId, input) => {
      const created = { ...draft, ...input, id: 'created-form', projectId }
      api.getDigitalForms.mockResolvedValue([created])
      return created
    })
    await openImport('attendance-survey.csv', 'beneficiary_id,attendance_status')
    confirmDialog('Create draft')
    await screen.findByRole('button', { name: 'Open form' })
    // jsdom cannot navigate, so the default action of the link click is cancelled.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true })
    fireEvent.click(screen.getByRole('link', { name: /Build forms/ }))
    const title = (await screen.findByLabelText('Form title')) as HTMLInputElement
    expect(title.value).toBe('Attendance Survey')
  })

  it('builds the fields from the file headers when extending', async () => {
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialMode="extend"
          initialView="import"
          initialProjectId="futuremakers-ncr"
        />
      </DisplayLabelsProvider>,
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Source file').matches(':disabled')).toBe(false),
    )
    fireEvent.change(screen.getByLabelText('Source file'), {
      target: {
        files: [csvFile('extend.csv', 'beneficiary_id,attendance_status\nBEN-001,Present')],
      },
    })
    await screen.findByText(/ready for/)
    fireEvent.click(screen.getByRole('button', { name: 'Extend in builder' }))
    const first = document.getElementById('collection-field-choice-imported-0-beneficiary_id')
    expect(first?.getAttribute('aria-pressed')).toBe('true')
    expect(
      document.getElementById('collection-field-choice-imported-1-attendance_status'),
    ).toBeTruthy()
  })
})
