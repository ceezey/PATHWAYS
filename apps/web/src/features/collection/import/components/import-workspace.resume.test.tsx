/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { ImportWorkspace } from './import-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: 'auth-1',
    userId: 'actor-1',
    organizationId: 'org-1',
    roles: ['PROJECT_OFFICER'],
    permissions: ['imports.upload', 'imports.read', 'forms.read'],
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
  resumeImportUpload: vi.fn(),
  automaticImportMapping: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('sonner', () => ({ toast: toasts }))

const form = {
  id: 'form-1',
  projectId: 'project-1',
  name: 'Import form',
  version: 1,
  status: 'PUBLISHED',
  fields: [{ code: 'note', label: 'Note', dataType: 'TEXT' }],
}
const batchWith = (mappingRevision: number, status: string) => ({
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formName: 'Import form',
  originalFileName: 'notes.csv',
  uploadedAt: '2026-09-28T00:00:00Z',
  mappingRevision,
  validationRevision: 0,
  processingRevision: 0,
  storageStatus: 'STORED',
  status,
  totals: { rows: 1, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0 },
  sourceColumns: [{ key: 'column_0001', header: 'note', columnIndex: 1 }],
  mappings: [{ sourceFieldName: 'column_0001', status: 'PENDING', targetField: null }],
})
const resume = async () => {
  render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
  await screen.findByText('notes.csv')
  fireEvent.click(screen.getByText('notes.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Resume stored upload' }))
}

describe('import workspace stored upload recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    api.getImportBatches.mockResolvedValue([batchWith(0, 'RECOVERY_REQUIRED')])
    api.getImportRows.mockResolvedValue({ rows: [], total: 1 })
    api.getImportBatch.mockResolvedValue(batchWith(0, 'RECOVERY_REQUIRED'))
    api.resumeImportUpload.mockResolvedValue(batchWith(0, 'UPLOADED'))
    api.automaticImportMapping.mockResolvedValue({ mappingRevision: 1 })
  })
  afterEach(cleanup)

  it('finalizes the stored source, maps it automatically and reloads the batch', async () => {
    await resume()

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Stored source finalization resumed.'),
    )
    expect(api.resumeImportUpload).toHaveBeenCalledWith('project-1', 'batch-1')
    expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 0)
    expect(api.resumeImportUpload.mock.invocationCallOrder[0]).toBeLessThan(
      api.automaticImportMapping.mock.invocationCallOrder[0],
    )
  })

  it('skips automatic mapping when the stored batch already has a mapping revision', async () => {
    api.getImportBatch.mockResolvedValue(batchWith(1, 'RECOVERY_REQUIRED'))
    await resume()

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Stored source finalization resumed.'),
    )
    expect(api.automaticImportMapping).not.toHaveBeenCalled()
  })

  it('reports a failed recovery without mapping', async () => {
    api.resumeImportUpload.mockRejectedValue(new Error('Stored source is not readable.'))
    await resume()

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Stored source is not readable.'))
    expect(api.automaticImportMapping).not.toHaveBeenCalled()
    expect(toasts.success).not.toHaveBeenCalled()
  })
})
