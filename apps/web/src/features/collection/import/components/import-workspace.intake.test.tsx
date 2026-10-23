/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import { takeDraftSummary } from '../../forms/draft-handoff'
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
    state.profile = { ...state.profile, permissions: [...grants] }
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([formV1])
    api.getDigitalForm.mockResolvedValue(formV1)
    api.getImportBatches.mockResolvedValue([batch()])
    api.getImportBatch.mockResolvedValue(batch())
    api.getImportRows.mockResolvedValue({ rows: [], total: 2 })
  })
  afterEach(cleanup)

  describe('prepare form', () => {
    const uploadUncovered = async () => {
      api.getImportBatches.mockResolvedValue([])
      api.uploadImport.mockResolvedValue(batch({ mappingRevision: 0 }))
      api.automaticImportMapping.mockResolvedValue(receipt())
      render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
      await uploadFile()
      await screen.findByText('Form needs updating: 2 columns, 5 answers')
    }

    it('shows the read-only notice, not the button, without forms.manage', async () => {
      await uploadUncovered()
      expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
      expect(screen.getByText(/Someone who manages forms/)).toBeTruthy()
    })

    it('drafts from the batch, opens the editor and hands over the summary', async () => {
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
      expect(takeDraftSummary('draft-1')).toEqual(summary)
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
      await screen.findByText('Form needs updating: 2 columns, 5 answers')
      expect(api.validateImport).not.toHaveBeenCalled()
      expect(api.processImport).not.toHaveBeenCalled()
    })
  })
})
