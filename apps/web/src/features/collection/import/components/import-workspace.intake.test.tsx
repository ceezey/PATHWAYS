/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import {
  UPLOAD_NEEDS_CLIENT_ID_ROLE,
  UPLOAD_NEEDS_FORM_UPDATE,
  UPLOAD_NEEDS_PARTICIPANT_ROLE,
} from '../../collection.copy'
import { ImportWorkspace } from './import-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: 'auth-1',
    userId: 'actor-1',
    organizationId: 'org-1',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [] as string[],
    assignedProjectIds: ['project-1'],
  },
}))
const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getDigitalForms: vi.fn(),
  getDigitalForm: vi.fn(),
  getImportBatches: vi.fn(),
  getImportBatch: vi.fn(),
  getImportRows: vi.fn(),
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  rerunImport: vi.fn(),
  validateImport: vi.fn(),
  processImport: vi.fn(),
  draftFromImport: vi.fn(),
}))
const nav = vi.hoisted(() => ({ push: vi.fn() }))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('next/navigation', () => ({ useRouter: () => nav }))
vi.mock('sonner', () => ({ toast: toasts }))

const formV1 = {
  id: 'form-1',
  projectId: 'project-1',
  code: 'registration',
  name: 'Registration',
  version: 1,
  status: 'PUBLISHED',
  fields: [{ code: 'first_name', label: 'First name', dataType: 'TEXT' }],
}
const formV2 = { ...formV1, id: 'form-2', version: 2 }
const totals = {
  rows: 2,
  valid: 2,
  invalid: 0,
  processed: 0,
  unprocessed: 0,
  failed: 0,
  warnings: 0,
}
const batch = (over: object = {}) => ({
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formCode: 'registration',
  formName: 'Registration',
  originalFileName: 'people.csv',
  uploadedAt: '2026-10-23T00:00:00Z',
  uploadedByCurrentUser: true,
  mappingRevision: 1,
  validationRevision: 0,
  validatedMappingRevision: null,
  processingRevision: 0,
  storageStatus: 'STORED',
  status: 'MAPPED',
  totals,
  sourceColumns: [{ key: 'column_0001', header: 'Given name', columnIndex: 1 }],
  mappings: [{ sourceFieldName: 'column_0001', status: 'PENDING', targetField: null }],
  ...over,
})
const receipt = (over: object = {}) => ({
  batchId: 'batch-1',
  mappingRevision: 1,
  mapped: 0,
  pending: 2,
  ignored: 0,
  requiredUnmapped: 0,
  complete: false,
  coverage: 'NOT_COVERED',
  uncoveredColumns: 2,
  unresolvedValues: 5,
  ...over,
})
const covered = {
  coverage: 'COVERED',
  complete: true,
  mapped: 1,
  pending: 0,
  uncoveredColumns: 0,
  unresolvedValues: 0,
}
const summary = {
  addedFields: ['given_name'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 0,
  defaults: [],
  rules: [],
  needsCheck: [],
}
const grants = ['imports.read', 'imports.upload', 'forms.read']

const uploadFile = async () => {
  await screen.findByText('Registration - v1')
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [new File(['Given name\nAna\n'], 'people.csv', { type: 'text/csv' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
}
const openBatch = async () => {
  render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
  fireEvent.click(await screen.findByText('people.csv'))
  await screen.findByText('Column 1: Given name')
}

describe('import workspace intake paths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile = {
      ...state.profile,
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: [...grants],
    }
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([formV1])
    api.getDigitalForm.mockResolvedValue(formV1)
    api.getImportBatches.mockResolvedValue([batch()])
    api.getImportBatch.mockResolvedValue(batch())
    api.getImportRows.mockResolvedValue({ rows: [], total: 2 })
  })
  afterEach(cleanup)

  describe('a link to an import', () => {
    const projects = [
      { id: 'project-1', title: 'Project' },
      { id: 'project-2', title: 'Second Project' },
    ]
    const assigned = state.profile.assignedProjectIds
    beforeEach(() => {
      api.getProjects.mockResolvedValue(projects)
      state.profile = { ...state.profile, assignedProjectIds: ['project-1', 'project-2'] }
    })
    afterEach(() => {
      state.profile = { ...state.profile, assignedProjectIds: assigned }
    })

    it('chooses the linked project and opens the linked batch', async () => {
      const linked = batch({ id: 'batch-2', projectId: 'project-2' })
      api.getImportBatches.mockResolvedValue([linked])
      api.getImportBatch.mockResolvedValue(linked)
      render(<ImportWorkspace target={{ projectId: 'project-2', batchId: 'batch-2' }} />, {
        wrapper: DisplayLabelsProvider,
      })
      await waitFor(() => expect(api.getImportBatch).toHaveBeenCalledWith('project-2', 'batch-2'))
      expect(api.getImportBatches).toHaveBeenCalledWith('project-2')
      expect(api.getImportBatch).toHaveBeenCalledTimes(1)
    })

    it('ignores a project outside the list the server gave', async () => {
      render(<ImportWorkspace target={{ projectId: 'project-9', batchId: 'batch-1' }} />, {
        wrapper: DisplayLabelsProvider,
      })
      await screen.findByText('No project selected')
      expect(api.getDigitalForms).not.toHaveBeenCalled()
      expect(api.getImportBatch).not.toHaveBeenCalled()
    })

    it('opens no batch that is not in the project list', async () => {
      render(<ImportWorkspace target={{ projectId: 'project-1', batchId: 'batch-9' }} />, {
        wrapper: DisplayLabelsProvider,
      })
      await screen.findByText('people.csv')
      expect(api.getImportBatch).not.toHaveBeenCalled()
    })
  })

  describe('prepare form', () => {
    const uploadUncovered = async () => {
      api.getImportBatches.mockResolvedValue([])
      api.uploadImport.mockResolvedValue(batch({ mappingRevision: 0 }))
      api.automaticImportMapping.mockResolvedValue(receipt())
      render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
      await uploadFile()
      await screen.findByText('1 column needs a decision: map it to a field, or ignore it.')
    }

    it('shows the read-only notice, not the button, without forms.manage', async () => {
      await uploadUncovered()
      expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
      expect(screen.getByText(/Someone who manages forms/)).toBeTruthy()
    })

    it('drafts from the batch and opens the editor', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      api.draftFromImport.mockResolvedValue({
        form: { id: 'draft-1', projectId: 'project-1' },
        summary,
      })
      await uploadUncovered()
      fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
      await waitFor(() =>
        expect(nav.push).toHaveBeenCalledWith('/collection/projects/project-1/forms/draft-1'),
      )
      expect(api.draftFromImport).toHaveBeenCalledWith('project-1', 'form-1', 'batch-1', 1)
    })

    it('offers Prepare form from the detail coverage to a forms.manage holder who did not upload it', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      const stored = batch({
        uploadedByCurrentUser: false,
        coverage: { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 5 },
      })
      api.getImportBatches.mockResolvedValue([stored])
      api.getImportBatch.mockResolvedValue(stored)
      await openBatch()
      await screen.findByText('1 column needs a decision: map it to a field, or ignore it.')
      fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
      await waitFor(() =>
        expect(api.draftFromImport).toHaveBeenCalledWith('project-1', 'form-1', 'batch-1', 1),
      )
    })

    it('says in plain words when the draft is refused', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      api.draftFromImport.mockRejectedValue(
        new Error('Every column is already covered by the form.'),
      )
      await uploadUncovered()
      fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
      await waitFor(() =>
        expect(toasts.error).toHaveBeenCalledWith('Every column is already covered by the form.'),
      )
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  describe('a System Administrator, who edits forms and does not import files', () => {
    const asAdministrator = () => {
      state.profile.roles = ['SYSTEM_ADMINISTRATOR']
      state.profile.permissions = [...grants, 'forms.manage']
    }

    it('has no file picker or Upload privately, and still sees the batches', async () => {
      asAdministrator()
      await openBatch()
      expect(screen.queryByLabelText('Source file')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Upload privately' })).toBeNull()
      expect(screen.getAllByText('people.csv').length).toBeGreaterThan(0)
    })

    it('has no form version choice, because nothing reads it without an upload', async () => {
      asAdministrator()
      await openBatch()
      expect(screen.queryByText('Published form(s)')).toBeNull()
    })

    it('reads as a list of batches, with no words about uploading', async () => {
      asAdministrator()
      await openBatch()
      expect(screen.getByText('Choose a project to see its import batches.')).toBeTruthy()
      expect(screen.queryByText('Private source upload')).toBeNull()
      expect(screen.queryByText(/Upload a private CSV/)).toBeNull()
    })

    it('can still prepare a form from a batch someone else uploaded', async () => {
      asAdministrator()
      const stored = batch({
        uploadedByCurrentUser: false,
        coverage: { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 5 },
      })
      api.getImportBatches.mockResolvedValue([stored])
      api.getImportBatch.mockResolvedValue(stored)
      await openBatch()
      expect(await screen.findByRole('button', { name: 'Prepare form' })).toBeTruthy()
    })

    it('has no Re-run import on a batch they uploaded earlier', async () => {
      asAdministrator()
      api.getDigitalForms.mockResolvedValue([formV1, formV2])
      await openBatch()
      expect(screen.queryByRole('button', { name: 'Re-run import' })).toBeNull()
    })

    it('leaves the file picker and Upload privately for other roles', async () => {
      api.getImportBatches.mockResolvedValue([])
      render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
      await screen.findByText('Registration - v1')
      expect(screen.getByLabelText('Source file')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Upload privately' })).toBeTruthy()
    })
  })

  describe('a file missing a required column', () => {
    const required = {
      ...formV1,
      formType: 'ACTIVITY',
      fields: [
        {
          id: 'field-1',
          code: 'first_name',
          label: 'First name',
          dataType: 'TEXT',
          required: true,
          metadataKey: false,
          sadddField: false,
          allowedValues: null,
          minimumLength: null,
          maximumLength: null,
          sequence: 1,
        },
      ],
    }
    const clientId = {
      ...required.fields[0],
      id: 'field-2',
      code: 'external_identifier_value',
      required: false,
      label: 'Client ID',
      sequence: 2,
    }
    const openDialog = async (formType = 'OTHER', fields = required.fields) => {
      const form = { ...required, formType, fields }
      api.getDigitalForms.mockResolvedValue([form])
      api.getDigitalForm.mockResolvedValue(form)
      api.getImportBatches.mockResolvedValue([])
      api.uploadImport.mockResolvedValue(batch({ mappingRevision: 0 }))
      api.automaticImportMapping.mockResolvedValue(receipt())
      render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
      await screen.findByText('Registration - v1')
      // jsdom's File has no arrayBuffer, so the bytes are handed over directly.
      const bytes = new TextEncoder().encode('Nickname\nAna\n')
      const file = new File([bytes], 'people.csv', { type: 'text/csv' })
      file.arrayBuffer = async () => bytes.buffer as ArrayBuffer
      fireEvent.change(screen.getByLabelText('Source file'), { target: { files: [file] } })
      fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
      await screen.findByRole('dialog', { name: 'Check your file before uploading' })
    }

    it('Prepare form in the dialog uploads, drafts and opens the editor', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      api.draftFromImport.mockResolvedValue({
        form: { id: 'draft-1', projectId: 'project-1' },
        summary,
      })
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
      await waitFor(() =>
        expect(nav.push).toHaveBeenCalledWith('/collection/projects/project-1/forms/draft-1'),
      )
      expect(api.uploadImport).toHaveBeenCalledTimes(1)
      expect(api.draftFromImport).toHaveBeenCalledWith('project-1', 'form-1', 'batch-1', 1)
    })

    it('a form manager without the register grant is not offered a registration upload the server refuses', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      await openDialog('BENEFICIARY_REGISTRATION')
      expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
      expect(screen.getByRole('tooltip').textContent).toBe(UPLOAD_NEEDS_PARTICIPANT_ROLE)
      expect(api.uploadImport).not.toHaveBeenCalled()
    })

    const canRegister = ['beneficiaries.records.register', 'beneficiaries.enrollments.manage']

    it('a Project Officer is told a form matching by client ID needs another role', async () => {
      state.profile.roles = ['PROJECT_OFFICER']
      state.profile.permissions = [...grants, ...canRegister]
      await openDialog('BENEFICIARY_REGISTRATION', [...required.fields, clientId])
      fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
      expect(screen.getByRole('tooltip').textContent).toBe(UPLOAD_NEEDS_CLIENT_ID_ROLE)
      expect(api.uploadImport).not.toHaveBeenCalled()
    })

    it('a Project Officer keeps the form update reason on a registration form with no client ID', async () => {
      state.profile.roles = ['PROJECT_OFFICER']
      state.profile.permissions = [...grants, ...canRegister]
      await openDialog('BENEFICIARY_REGISTRATION')
      fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
      expect(screen.getByRole('tooltip').textContent).toBe(UPLOAD_NEEDS_FORM_UPDATE)
    })

    it('an M&E Officer gets Prepare form on a registration form matching by client ID', async () => {
      state.profile.permissions = [
        ...grants,
        ...canRegister,
        'forms.manage',
        'beneficiaries.identities.review',
      ]
      await openDialog('BENEFICIARY_REGISTRATION', [...required.fields, clientId])
      expect(screen.getByRole('button', { name: 'Prepare form' })).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Upload anyway' }).getAttribute('aria-disabled'),
      ).toBeNull()
    })

    it('Upload anyway does not repeat the Prepare form offer on the mapping card', async () => {
      state.profile.permissions = [...grants, 'forms.manage']
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
      await screen.findByText('Column 1: Given name')
      expect(api.uploadImport).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/column needs a decision/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
    })

    it('someone who cannot manage forms cannot upload the file and is told who updates the form', async () => {
      await openDialog()
      expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
      expect(screen.getByRole('tooltip').textContent).toBe(UPLOAD_NEEDS_FORM_UPDATE)
      expect(api.uploadImport).not.toHaveBeenCalled()
    })
  })

  describe('re-run', () => {
    it('Re-run is shown only to the uploader when a newer published version exists', async () => {
      api.getDigitalForms.mockResolvedValue([formV1, formV2])
      await openBatch()
      expect(screen.getByRole('button', { name: 'Re-run import' })).toBeTruthy()
      cleanup()

      api.getImportBatch.mockResolvedValue(batch({ uploadedByCurrentUser: false }))
      api.getImportBatches.mockResolvedValue([batch({ uploadedByCurrentUser: false })])
      await openBatch()
      expect(screen.queryByRole('button', { name: 'Re-run import' })).toBeNull()
      cleanup()

      api.getDigitalForms.mockResolvedValue([formV1])
      api.getImportBatch.mockResolvedValue(batch())
      api.getImportBatches.mockResolvedValue([batch()])
      await openBatch()
      expect(screen.queryByRole('button', { name: 'Re-run import' })).toBeNull()
    })

    it('re-runs against the newest version, maps the new batch and imports it when covered', async () => {
      state.profile.permissions = [...grants, 'imports.validate', 'imports.process']
      api.getDigitalForms.mockResolvedValue([formV1, formV2])
      const next = batch({ id: 'batch-2', formId: 'form-2', formVersion: 2, mappingRevision: 0 })
      api.rerunImport.mockResolvedValue(next)
      api.automaticImportMapping.mockResolvedValue(receipt({ batchId: 'batch-2', ...covered }))
      api.validateImport.mockResolvedValue({ ...next, validationRevision: 1, status: 'VALIDATED' })
      api.getImportBatch.mockImplementation(async (_project: string, id: string) =>
        id === 'batch-2' ? { ...next, mappingRevision: 1 } : batch(),
      )
      api.processImport.mockResolvedValue({
        ...next,
        status: 'PROCESSED',
        totals: { ...totals, processed: 2 },
      })
      await openBatch()
      fireEvent.click(screen.getByRole('button', { name: 'Re-run import' }))
      await waitFor(() => expect(api.processImport).toHaveBeenCalledWith('project-1', 'batch-2', 1))
      expect(api.rerunImport).toHaveBeenCalledWith('project-1', 'batch-1', 'form-2')
      expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-2', 0)
      expect(api.validateImport).toHaveBeenCalledWith('project-1', 'batch-2', 1)
      await waitFor(() =>
        expect(toasts.success).toHaveBeenCalledWith(
          'Imported 2. 0 held for review, 0 invalid, 0 with warnings.',
        ),
      )
    })

    it('stops at the new batch when the new version still does not cover the file', async () => {
      state.profile.permissions = [...grants, 'imports.validate', 'imports.process']
      api.getDigitalForms.mockResolvedValue([formV1, formV2])
      const next = batch({ id: 'batch-2', formId: 'form-2', formVersion: 2, mappingRevision: 0 })
      api.rerunImport.mockResolvedValue(next)
      api.automaticImportMapping.mockResolvedValue(receipt({ batchId: 'batch-2' }))
      api.getImportBatch.mockImplementation(async (_project: string, id: string) =>
        id === 'batch-2' ? { ...next, mappingRevision: 1 } : batch(),
      )
      await openBatch()
      fireEvent.click(screen.getByRole('button', { name: 'Re-run import' }))
      await screen.findByText('1 column needs a decision: map it to a field, or ignore it.')
      expect(api.validateImport).not.toHaveBeenCalled()
      expect(api.processImport).not.toHaveBeenCalled()
    })
  })
})
