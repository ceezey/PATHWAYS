/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Children, type ReactElement, createContext, isValidElement, useContext } from 'react'
import { toast } from 'sonner'
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
    assignedProjectIds: ['project-1', 'project-2'],
  },
}))
const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getDigitalForms: vi.fn(),
  getImportBatches: vi.fn(),
  getImportBatch: vi.fn(),
  getImportRows: vi.fn(),
  automaticImportMapping: vi.fn(),
  uploadImport: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@pathways/imports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pathways/imports')>()),
  workbookSheetNames: () => ['One', 'Two'],
}))
// Native selects stand in for the Radix select, whose close path stalls jsdom for half a minute.
vi.mock('@/components/ui/select', () => {
  const Choice = createContext<{ value: string; change: (value: string) => void }>({
    value: '',
    change: () => {},
  })
  return {
    Select: ({ value, onValueChange, children }: Record<string, never>) => (
      <Choice.Provider value={{ value, change: onValueChange }}>{children}</Choice.Provider>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactElement }) => {
      const choice = useContext(Choice)
      return (
        <select value={choice.value} onChange={(event) => choice.change(event.target.value)}>
          {Children.toArray(children).filter(isValidElement)}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: ReactElement }) =>
      value ? <option value={value}>{children}</option> : null,
  }
})

const form = {
  id: 'form-1',
  projectId: 'project-1',
  name: 'Import form',
  version: 1,
  status: 'PUBLISHED',
  fields: [{ code: 'note', label: 'Note', dataType: 'TEXT' }],
}
const secondForm = { ...form, id: 'form-2', name: 'Second form' }
const notes = new File(['unknown\nhello\n'], 'notes.csv', { type: 'text/csv' })
const otherNotes = new File(['unknown\nworld\n'], 'other.csv', { type: 'text/csv' })

const uploadButton = () => screen.getByRole('button', { name: 'Upload privately' })
const pickFile = (file: File) =>
  fireEvent.change(screen.getByLabelText('Source file'), { target: { files: [file] } })
const pick = (label: string, value: string) =>
  fireEvent.change(
    within(screen.getByText(label, { selector: 'label' }).closest('div') as HTMLElement).getByRole(
      'combobox',
    ),
    { target: { value } },
  )
const idle = () => waitFor(() => expect((uploadButton() as HTMLButtonElement).disabled).toBe(false))

describe('import screen upload identity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getProjects.mockResolvedValue([
      { id: 'project-1', title: 'Project' },
      { id: 'project-2', title: 'Second Project' },
    ])
    api.getDigitalForms.mockImplementation(async (projectId: string) =>
      projectId === 'project-2' ? [{ ...form, projectId }] : [form, secondForm],
    )
    api.getImportBatches.mockResolvedValue([])
    api.uploadImport.mockRejectedValue(new Error('Upload response was lost.'))
  })
  afterEach(cleanup)

  const lostThenChanged = async (change: () => unknown) => {
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    await screen.findByText('Import form - v1')
    pickFile(notes)
    fireEvent.click(uploadButton())
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(1))
    await idle()
    await change()
    await idle()
    fireEvent.click(uploadButton())
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(2))
    const [first, second] = api.uploadImport.mock.calls
    return { first, second }
  }

  it('reuses the import id when file, project and form all match', async () => {
    const { first, second } = await lostThenChanged(() => {})
    expect(second).toEqual(first)
  })
  it('starts a new import id for a different file', async () => {
    const { first, second } = await lostThenChanged(() => pickFile(otherNotes))
    expect(second.slice(0, 2)).toEqual(first.slice(0, 2))
    expect(second[2]).not.toBe(first[2])
  })
  it('starts a new import id for a different project', async () => {
    const { first, second } = await lostThenChanged(async () => {
      pick('Project', 'project-2')
      await screen.findByText('Import form - v1')
      pickFile(notes)
    })
    expect(second.slice(0, 2)).toEqual(['project-2', 'form-1'])
    expect(second[2]).not.toBe(first[2])
  })
  it('starts a new import id for a different form', async () => {
    const { first, second } = await lostThenChanged(() => {
      pick('Published form version', 'form-2')
      pickFile(notes)
    })
    expect(second.slice(0, 2)).toEqual(['project-1', 'form-2'])
    expect(second[2]).not.toBe(first[2])
  })
})

describe('import screen failed upload', () => {
  const failed = {
    id: 'batch-1',
    projectId: 'project-1',
    formId: 'form-1',
    formVersion: 1,
    formName: 'Import form',
    originalFileName: 'notes.csv',
    uploadedAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
    mappingRevision: 0,
    validationRevision: 0,
    validatedMappingRevision: null,
    processingRevision: 0,
    storageStatus: 'STORED',
    status: 'FAILED',
    failureCode: 'WORKBOOK_FORMULA_NO_VALUE',
    failureMessage: 'Cell A2 has a formula with no saved value.',
    totals: { rows: 0, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0, warnings: 0 },
    sourceColumns: [],
    mappings: [],
  }
  beforeEach(() => {
    vi.resetAllMocks()
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getImportBatches.mockResolvedValue([])
    api.getImportBatch.mockResolvedValue(failed)
    api.getImportRows.mockResolvedValue({ rows: [], total: 0 })
    api.uploadImport.mockResolvedValue(failed)
  })
  afterEach(cleanup)

  it('shows why the file was refused and never maps a failed upload', async () => {
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    await screen.findByText('Import form - v1')
    pickFile(notes)
    fireEvent.click(uploadButton())
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Cell A2 has a formula with no saved value.'),
    )
    expect(api.automaticImportMapping).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('import screen workbook sheets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getImportBatches.mockResolvedValue([])
    api.uploadImport.mockRejectedValue(new Error('Upload response was lost.'))
  })
  afterEach(cleanup)

  it('asks which sheet of a multi-sheet workbook to read and sends it', async () => {
    render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
    await screen.findByText('Import form - v1')
    // jsdom files cannot read their bytes; the mocked sheet reader ignores them anyway.
    pickFile(
      Object.assign(new File(['PK'], 'people.xlsx'), {
        arrayBuffer: async () => new ArrayBuffer(2),
      }),
    )
    await screen.findByText('Sheet', { selector: 'label' })
    expect((uploadButton() as HTMLButtonElement).disabled).toBe(true)
    pick('Sheet', 'Two')
    await idle()
    fireEvent.click(uploadButton())
    await waitFor(() => expect(api.uploadImport).toHaveBeenCalledTimes(1))
    expect(api.uploadImport.mock.calls[0][4]).toBe('Two')
  })
})
