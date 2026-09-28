/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImportWorkspace } from './import-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: 'auth-1',
    userId: 'actor-1',
    organizationId: 'org-1',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['imports.read', 'imports.process', 'forms.read'],
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
  processImport: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const form = {
  id: 'form-1',
  projectId: 'project-1',
  name: 'Import form',
  version: 1,
  status: 'PUBLISHED',
  fields: [{ code: 'note', label: 'Note', dataType: 'TEXT' }],
}

const batchWith = (processed: number, valid = 250) => ({
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formName: 'Import form',
  originalFileName: 'notes.xlsx',
  uploadedAt: '2026-09-28T00:00:00Z',
  mappingRevision: 1,
  validationRevision: 1,
  validatedMappingRevision: 1,
  processingRevision: 0,
  storageStatus: 'STORED',
  status: processed === 0 ? 'VALIDATED' : processed >= valid ? 'PROCESSED' : 'PARTIALLY_PROCESSED',
  totals: { rows: valid, valid, invalid: 0, processed, unprocessed: 0, failed: 0 },
  sourceColumns: [{ key: 'column_0001', header: 'note', columnIndex: 1 }],
  mappings: [
    {
      sourceFieldName: 'column_0001',
      status: 'MAPPED',
      targetField: { code: 'note', label: 'Note' },
    },
  ],
})

const openBatch = async () => {
  render(<ImportWorkspace />)
  await screen.findByText('notes.xlsx')
  fireEvent.click(screen.getByText('notes.xlsx'))
  return screen.findByRole('button', { name: 'Process all valid rows' })
}

describe('import workspace automatic processing', () => {
  let processed = 0

  beforeEach(() => {
    vi.resetAllMocks()
    processed = 0
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    api.getImportBatches.mockResolvedValue([batchWith(0)])
    api.getImportRows.mockResolvedValue({ rows: [], total: 250 })
    api.getImportBatch.mockImplementation(async () => batchWith(processed))
    api.processImport.mockImplementation(async () => {
      processed = Math.min(250, processed + 100)
      return batchWith(processed)
    })
  })
  afterEach(cleanup)

  it('keeps focus inside the processing panel when "Process all valid rows" starts a run', async () => {
    fireEvent.click(await openBatch())

    const panel = await screen.findByRole('region', { name: 'Import processing' })
    // The panel mounts outside the disabled fieldset that held the focused button,
    // so it needs focusOnMount to keep focus from falling to the document body.
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('keeps processing until the batch is done and announces progress', async () => {
    fireEvent.click(await openBatch())

    const panel = await screen.findByRole('region', { name: 'Import processing' })
    await waitFor(() =>
      expect(within(panel).getByRole('status').textContent).toContain(
        'Processing finished: 250 of 250 rows handled',
      ),
    )
    expect(api.processImport).toHaveBeenCalledTimes(3)
    expect(api.processImport).toHaveBeenCalledWith('project-1', 'batch-1', 1)
    expect(within(panel).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  it('stops after the in-flight call and offers Resume processing', async () => {
    let release!: () => void
    api.processImport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            processed = 100
            resolve(batchWith(processed))
          }
        }),
    )
    fireEvent.click(await openBatch())

    const stop = await screen.findByRole('button', { name: 'Stop processing' })
    expect((stop as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(stop)
    await act(async () => release())

    const panel = screen.getByRole('region', { name: 'Import processing' })
    await waitFor(() =>
      expect(within(panel).getByRole('status').textContent).toContain(
        'Processing stopped: 100 of 250 rows handled',
      ),
    )
    expect(api.processImport).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: 'Resume processing' }).length).toBeGreaterThan(0)
    // Stop unmounted the focused control; focus lands on the enabled Resume button.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(panel).getByRole('button', { name: 'Resume processing' }),
      ),
    )

    fireEvent.click(within(panel).getByRole('button', { name: 'Resume processing' }))
    await waitFor(() =>
      expect(within(panel).getByRole('status').textContent).toContain('Processing finished'),
    )
    expect(api.processImport).toHaveBeenCalledTimes(3)
  })

  it('pauses on a failed call and labels the next action Resume processing', async () => {
    api.processImport
      .mockImplementationOnce(async () => {
        processed = 100
        return batchWith(processed)
      })
      .mockRejectedValueOnce(new Error('The application transaction is temporarily unavailable.'))
    fireEvent.click(await openBatch())

    const panel = await screen.findByRole('region', { name: 'Import processing' })
    await waitFor(() =>
      expect(within(panel).getByRole('status').textContent).toContain(
        'Processing paused: 100 of 250 rows handled',
      ),
    )
    expect(within(panel).getByRole('status').textContent).toContain('temporarily unavailable')
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Resume processing' })).toHaveLength(2),
    )
  })

  it('stops calling process once imports.process is revoked mid-run', async () => {
    let release!: () => void
    api.processImport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            processed = 100
            resolve(batchWith(processed))
          }
        }),
    )
    const view = render(<ImportWorkspace />)
    await screen.findByText('notes.xlsx')
    fireEvent.click(screen.getByText('notes.xlsx'))
    fireEvent.click(await screen.findByRole('button', { name: 'Process all valid rows' }))
    await waitFor(() => expect(api.processImport).toHaveBeenCalledTimes(1))

    state.profile = { ...state.profile, permissions: ['imports.read', 'forms.read'] }
    view.rerender(<ImportWorkspace />)
    await act(async () => release())

    expect(api.processImport).toHaveBeenCalledTimes(1)
    state.profile = {
      ...state.profile,
      permissions: ['imports.read', 'imports.process', 'forms.read'],
    }
  })

  it('does not offer processing without imports.process', async () => {
    state.profile = { ...state.profile, permissions: ['imports.read', 'forms.read'] }
    const button = await openBatch()
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(api.processImport).not.toHaveBeenCalled()
    state.profile = {
      ...state.profile,
      permissions: ['imports.read', 'imports.process', 'forms.read'],
    }
  })
})
