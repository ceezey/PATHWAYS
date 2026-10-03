/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { ImportWorkspace } from './import-workspace'

const reviewer = ['imports.read', 'imports.review', 'imports.validate', 'forms.read']
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
  saveImportMapping: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const form = {
  id: 'form-1',
  projectId: 'project-1',
  name: 'Registration',
  version: 1,
  status: 'PUBLISHED',
  fields: [
    { code: 'first_name', label: 'First name', dataType: 'TEXT' },
    { code: 'last_name', label: 'Last name', dataType: 'TEXT' },
    { code: 'sex', label: 'Sex', dataType: 'SELECT', allowedValues: ['MALE', 'FEMALE'] },
  ],
}

const smartBatch = (mappings: unknown[], revision = 1) => ({
  id: 'batch-1',
  projectId: 'project-1',
  formId: 'form-1',
  formVersion: 1,
  formName: 'Registration',
  originalFileName: 'people.csv',
  uploadedAt: '2026-09-28T00:00:00Z',
  mappingRevision: revision,
  validationRevision: 0,
  validatedMappingRevision: null,
  processingRevision: 0,
  storageStatus: 'STORED',
  status: 'UPLOADED',
  totals: { rows: 2, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0 },
  sourceColumns: [
    { key: 'column_0001', header: 'Given name', columnIndex: 1 },
    { key: 'column_0002', header: 'The Last Name', columnIndex: 2 },
    { key: 'column_0003', header: 'Gender', columnIndex: 3 },
  ],
  mappings,
})

const automatic = [
  {
    sourceFieldName: 'column_0001',
    status: 'MAPPED',
    revision: 1,
    targetField: { code: 'first_name', label: 'First name' },
    validationMessage: 'AUTO_SMART_V2:AUTO_MATCH',
    suggestedField: null,
    matchScore: 90,
    matchReason: 'SYNONYM',
  },
  {
    sourceFieldName: 'column_0002',
    status: 'PENDING',
    revision: 1,
    targetField: null,
    validationMessage: 'AUTO_SMART_V2:SUGGESTED',
    suggestedField: { code: 'last_name', label: 'Last name' },
    matchScore: 85,
    matchReason: 'TOKEN_SET',
  },
  {
    sourceFieldName: 'column_0003',
    status: 'PENDING',
    revision: 1,
    targetField: null,
    validationMessage: 'AUTO_SMART_V2:SUGGESTED',
    suggestedField: { code: 'sex', label: 'Sex' },
    matchScore: 80,
    matchReason: 'SYNONYM_REVIEW',
  },
]

const openBatch = async () => {
  render(<ImportWorkspace />, { wrapper: DisplayLabelsProvider })
  fireEvent.click(await screen.findByText('people.csv'))
  await screen.findByText('Column 1: Given name')
}

describe('import workspace AUTO_SMART_V2 suggestions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile = {
      ...state.profile,
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: [...reviewer],
    }
    api.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([form])
    api.getDigitalForm.mockResolvedValue(form)
    api.getImportBatches.mockResolvedValue([smartBatch(automatic)])
    api.getImportRows.mockResolvedValue({ rows: [], total: 2 })
    api.getImportBatch.mockResolvedValue(smartBatch(automatic))
    api.saveImportMapping.mockResolvedValue(smartBatch([], 2))
  })
  afterEach(cleanup)

  it('shows the auto-matched badge with its reason and each suggestion', async () => {
    await openBatch()
    expect(screen.getByText('Auto-matched: known synonym')).toBeTruthy()
    expect(screen.getByText('Suggested: Last name')).toBeTruthy()
    expect(screen.getByText('Suggested: Sex')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Confirm suggestion/ })).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('confirms one suggestion into the draft, announces what remains and keeps focus useful', async () => {
    await openBatch()
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm suggestion Last name for column 2' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        '1 suggestion confirmed. 1 column needs a target or an explicit ignore before the revision can be saved.',
      ),
    )
    expect(screen.queryByText('Suggested: Last name')).toBeNull()
    expect(api.saveImportMapping).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.activeElement?.id).toBe('import-mapping-target-column_0002'),
    )
  })

  it('confirms all suggestions and writes one manual revision through the review path', async () => {
    await openBatch()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm all suggestions' }))
    await waitFor(() => expect(api.saveImportMapping).toHaveBeenCalledTimes(1))
    expect(api.saveImportMapping).toHaveBeenCalledWith('project-1', 'batch-1', 1, [
      { sourceFieldName: 'column_0001', ignored: false, targetFieldCode: 'first_name' },
      { sourceFieldName: 'column_0002', ignored: false, targetFieldCode: 'last_name' },
      { sourceFieldName: 'column_0003', ignored: false, targetFieldCode: 'sex' },
    ])
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Mapping revision saved. Validation results were reset.',
      ),
    )
    // The saved state is reloaded from the server, not kept from the draft.
    expect(api.getImportBatch).toHaveBeenCalledTimes(2)
  })

  it('skips a suggestion whose field the reviewer already chose for another column', async () => {
    await openBatch()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm suggestion Sex for column 3' }))
    await screen.findByText(/1 suggestion confirmed/)
    api.getImportBatch.mockResolvedValue(
      smartBatch([
        automatic[0],
        { ...automatic[1], suggestedField: { code: 'sex', label: 'Sex' } },
        automatic[2],
      ]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload server state' }))
    await waitFor(() => expect(api.getImportBatch).toHaveBeenCalledTimes(2))
    // Reload resets the draft to the server state; both columns now suggest Sex.
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm all suggestions' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        '1 suggestion skipped because the field is already chosen for another column.',
      ),
    )
    expect(api.saveImportMapping).not.toHaveBeenCalled()
  })

  it('shows suggestions read-only and hides confirm controls without imports.review', async () => {
    state.profile = {
      ...state.profile,
      roles: ['PROJECT_OFFICER'],
      permissions: ['imports.read', 'imports.upload', 'forms.read'],
    }
    await openBatch()
    expect(screen.getByText('Suggested: Last name')).toBeTruthy()
    expect(screen.getAllByText('An authorized reviewer can confirm it.')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^Confirm suggestion/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirm all suggestions' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Save new mapping revision' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(api.saveImportMapping).not.toHaveBeenCalled()
  })

  it('locks confirmation once processing has frozen the mapping', async () => {
    const frozen = { ...smartBatch(automatic), status: 'PROCESSING', processingRevision: 1 }
    api.getImportBatches.mockResolvedValue([frozen])
    api.getImportBatch.mockResolvedValue(frozen)
    await openBatch()
    for (const button of screen.getAllByRole('button', { name: /^Confirm/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
