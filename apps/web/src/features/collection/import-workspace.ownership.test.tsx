import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  uploadImport: vi.fn(),
  automaticImportMapping: vi.fn(),
  saveImportMapping: vi.fn(),
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
const batch = {
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formName: 'Import form',
  originalFileName: 'notes.csv',
  uploadedAt: '2026-09-27T00:00:00Z',
  mappingRevision: 1,
  validationRevision: 0,
  processingRevision: 0,
  storageStatus: 'STORED',
  status: 'UPLOADED',
  totals: { rows: 1, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0 },
  sourceColumns: [{ key: 'column_0001', header: 'unknown', columnIndex: 1 }],
  mappings: [{ sourceFieldName: 'column_0001', status: 'PENDING', targetField: null }],
}
const grants = ['imports.upload', 'imports.read', 'forms.read']
const chooseFile = async () => {
  await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
  await screen.findByText('Import form - v1')
  fireEvent.change(screen.getByLabelText('Source file'), {
    target: { files: [new File(['unknown\nhello\n'], 'notes.csv', { type: 'text/csv' })] },
  })
}
describe('import uploader automation and ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile = {
      ...state.profile,
      permissions: [...grants],
      assignedProjectIds: ['project-1'],
      userId: 'actor-1',
    }
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    api.getImportBatches.mockResolvedValue([])
    api.getImportBatch.mockResolvedValue(batch)
    api.getImportRows.mockResolvedValue({ rows: [], total: 1 })
    api.uploadImport.mockResolvedValue({ ...batch, mappingRevision: 0 })
    api.automaticImportMapping.mockResolvedValue({
      batchId: batch.id,
      mappingRevision: 1,
      mapped: 0,
      pending: 1,
      requiredUnmapped: 0,
      complete: false,
    })
  })
  afterEach(cleanup)
  it('permits PO upload and conservative automatic mapping without reviewer grant', async () => {
    render(<ImportWorkspace />)
    await chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
    await waitFor(() =>
      expect(api.automaticImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 0),
    )
    await screen.findByText('Pending: select a target or explicit ignore')
    expect(api.saveImportMapping).not.toHaveBeenCalled()
  })
  it('shows the fetched project selection even when the list arrives after the initial render', async () => {
    let resolveProjects: ((value: Array<{ id: string; title: string }>) => void) | undefined
    api.getProjects.mockReturnValue(
      new Promise((resolve) => {
        resolveProjects = resolve
      }),
    )
    render(<ImportWorkspace />)
    await screen.findByText('Loading authorized projects...')
    await act(async () => {
      resolveProjects?.([
        { id: 'project-1', title: 'Project' },
        { id: 'project-2', title: 'Second Project' },
      ])
    })
    await waitFor(() =>
      expect(
        within(
          screen.getByText('Project', { selector: 'label' }).closest('div') as HTMLElement,
        ).getByRole('combobox').textContent,
      ).toContain('Project'),
    )
  })

  it('shows the fetched projects again on a second mount (a cached list on remount)', async () => {
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    const first = render(<ImportWorkspace />)
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    first.unmount()
    api.getProjects.mockClear()

    render(<ImportWorkspace />)
    await waitFor(() => expect(api.getProjects).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        within(
          screen.getByText('Project', { selector: 'label' }).closest('div') as HTMLElement,
        ).getByRole('combobox').textContent,
      ).toContain('Project'),
    )
  })

  it('does not remount (and so does not lose the selection) when a permission grant is rebuilt in a different order', async () => {
    api.getProjects.mockResolvedValue([
      { id: 'project-1', title: 'Project' },
      { id: 'project-2', title: 'Second Project' },
    ])
    const view = render(<ImportWorkspace />)
    await waitFor(() => expect(api.getDigitalForms).toHaveBeenCalled())
    expect(api.getProjects).toHaveBeenCalledTimes(1)

    const combobox = () =>
      within(
        screen.getByText('Project', { selector: 'label' }).closest('div') as HTMLElement,
      ).getByRole('combobox')
    await waitFor(() => expect(combobox().textContent).toContain('Project'))

    // The permission grant is rebuilt with the same permissions in a different order
    // (e.g. after a token refresh merges grants from two sources). Before this fix, the
    // access key used for the workspace's remount identity was built from the raw,
    // unsorted permissions array, so this reorder alone would remount the workspace,
    // re-run its project fetch and silently reset whichever project the user had picked.
    state.profile = { ...state.profile, permissions: [...state.profile.permissions].reverse() }
    view.rerender(<ImportWorkspace />)

    // No remount: the effect that fetches and defaults the project selection never
    // reruns, so the selection already on screen is provably untouched.
    expect(api.getProjects).toHaveBeenCalledTimes(1)
    expect(combobox().textContent).toContain('Project')
  })

  it.each(['logout', 'actor', 'assignment', 'grant', 'unmount'])(
    'stops upload continuation after %s',
    async (reason) => {
      let resolve!: (value: typeof batch) => void
      api.uploadImport.mockReturnValue(
        new Promise((resolvePromise) => {
          resolve = resolvePromise
        }),
      )
      const view = render(<ImportWorkspace />)
      await chooseFile()
      fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
      await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(1))
      if (reason === 'logout') act(() => clearSensitiveDraftStorage())
      else if (reason === 'unmount') view.unmount()
      else {
        state.profile = {
          ...state.profile,
          ...(reason === 'actor'
            ? { userId: 'actor-2' }
            : reason === 'assignment'
              ? { assignedProjectIds: [] }
              : { permissions: ['imports.read', 'forms.read'] }),
        }
        view.rerender(<ImportWorkspace />)
      }
      await act(async () => {
        resolve({ ...batch, mappingRevision: 0 })
        await Promise.resolve()
      })
      expect(api.automaticImportMapping).not.toHaveBeenCalled()
    },
  )
  it('retains upload request identity when automatic mapping fails and selected file is retried', async () => {
    api.automaticImportMapping.mockRejectedValueOnce(new Error('Temporary mapping failure'))
    render(<ImportWorkspace />)
    await chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
    await waitFor(() => expect(api.automaticImportMapping).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Upload privately' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Upload privately' }))
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(2))
    expect(api.uploadImport.mock.calls[0][2]).toBe(api.uploadImport.mock.calls[1][2])
  })
})
