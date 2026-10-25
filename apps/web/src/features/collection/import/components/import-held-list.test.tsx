/* @vitest-environment jsdom */
import { importHoldCodes } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { ImportHeldList } from './import-held-list'

const state = vi.hoisted(() => ({
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['imports.read', 'imports.review', 'beneficiaries.records.register'] as string[],
  },
}))
const api = vi.hoisted(() => ({
  getHeldRows: vi.fn(),
  getRowReview: vi.fn(),
  approveGuardianConsent: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))

const totals = {
  rows: 20,
  valid: 20,
  invalid: 0,
  processed: 8,
  unprocessed: 12,
  failed: 0,
  warnings: 0,
}
const batch = {
  id: 'batch-1',
  projectId: 'project-1',
  validationRevision: 2,
  formType: 'BENEFICIARY_REGISTRATION',
  totals,
  registrationCounts: { created: 5, updated: 2, unchanged: 1 },
  mappings: [
    { sourceFieldName: 'column_0001', status: 'MAPPED', targetField: { code: 'first_name' } },
    { sourceFieldName: 'column_0002', status: 'MAPPED', targetField: { code: 'last_name' } },
  ],
} as unknown as ImportBatchDefinition
const held = (code: string, index: number) =>
  ({
    id: `row-${index}`,
    rowNumber: index + 2,
    rawData: { column_0001: `First${index}`, column_0002: `Last${index}` },
    status: 'UNPROCESSED',
    processingErrorCode: code,
  }) as unknown as ImportRowDefinition
const show = async (rows: ImportRowDefinition[], current = batch) => {
  api.getHeldRows.mockResolvedValue(rows)
  const view = render(<ImportHeldList batch={current} onChanged={vi.fn()} />)
  if (rows.length > 0)
    await screen.findByText(`First${rows[0].rowNumber - 2} Last${rows[0].rowNumber - 2}`)
  return view
}
const invalid = (code: string, index: number) =>
  ({
    ...held('', index),
    status: 'INVALID',
    processingErrorCode: null,
    validationErrors: [{ fieldCode: 'age', code, message: 'x' }],
  }) as unknown as ImportRowDefinition

describe('import held list', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile.permissions = ['imports.read', 'imports.review', 'beneficiaries.records.register']
  })
  afterEach(cleanup)

  it('each code has a plain reason', async () => {
    await show(importHoldCodes.map(held))
    const reasons = importHoldCodes.map((_code, index) => {
      const row = screen.getByText(`First${index} Last${index}`).closest('tr') as HTMLElement
      return within(row).getAllByRole('cell')[2].textContent ?? ''
    })
    for (const reason of reasons) expect(reason).toMatch(/^[A-Z][a-z]+( [A-Za-z0-9,-]+)+$/)
    expect(new Set(reasons).size).toBe(importHoldCodes.length)
    expect(reasons[importHoldCodes.indexOf('PROFILE_CHANGED')]).toBe('Values differ from PATHWAYS')
  })

  it('shows the batch result counts', async () => {
    await show([held('PROFILE_CHANGED', 0)])
    const group = screen.getByRole('group', { name: 'Import results' })
    for (const [label, value] of [
      ['Created', '5'],
      ['Updated', '2'],
      ['Unchanged', '1'],
      ['Held', '12'],
    ]) {
      expect(within(group).getByText(label).parentElement?.textContent).toContain(value)
    }
  })

  it('names each participant from the mapped name columns', async () => {
    await show([held('PROFILE_CHANGED', 0)])
    expect(screen.getByText('First0 Last0')).toBeTruthy()
  })

  it('offers Review only for rows a data reviewer can resolve', async () => {
    api.getRowReview.mockReturnValue(new Promise(() => {}))
    await show([held('PROFILE_CHANGED', 0), held('GUARDIAN_CONSENT_REQUIRED', 1)])
    expect(screen.getAllByRole('button', { name: /^Review/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Review row 2' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.getRowReview).toHaveBeenCalledWith('project-1', 'batch-1', 'row-0')
  })

  it('shows the held minors to a data reviewer without any Approve control', async () => {
    await show([held('GUARDIAN_CONSENT_REQUIRED', 0)])
    expect(screen.getByText('Under 18, waiting for guardian approval')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
  })

  it('offers the guardian panel to an approving officer', async () => {
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'beneficiaries.guardian_consent.approve']
    await show([held('GUARDIAN_CONSENT_REQUIRED', 0)])
    expect(screen.getByRole('region', { name: 'Guardian approval' })).toBeTruthy()
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  })

  it('shows no Review button without imports.review', async () => {
    state.profile.permissions = ['imports.read']
    await show([held('PROFILE_CHANGED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
  })

  it('shows nothing for a batch with no held rows and no counts', async () => {
    const quiet = { ...batch, registrationCounts: undefined, totals: { ...totals, unprocessed: 0 } }
    const { container } = await show([], quiet as unknown as ImportBatchDefinition)
    expect(container.textContent).toBe('')
  })

  it('lists invalid registration rows with a plain reason and counts them as held', async () => {
    const withInvalid = { ...batch, totals: { ...totals, unprocessed: 1, invalid: 2 } }
    await show(
      [held('PROFILE_CHANGED', 0), invalid('AGE_MISMATCH', 1), invalid('some_other_code', 2)],
      withInvalid as unknown as ImportBatchDefinition,
    )
    expect(screen.getByText('Age does not match the birth date')).toBeTruthy()
    expect(screen.getByText('A value in this row is not valid')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Import results' })
    expect(within(group).getByText('Held').parentElement?.textContent).toContain('3')
    expect(screen.getAllByRole('button', { name: /^Review/ })).toHaveLength(3)
  })

  it('does not count invalid rows of a batch that is not a registration', async () => {
    const other = { ...batch, formType: 'OTHER', totals: { ...totals, unprocessed: 0, invalid: 4 } }
    const { container } = await show([], {
      ...other,
      registrationCounts: undefined,
    } as unknown as ImportBatchDefinition)
    expect(container.textContent).toBe('')
    expect(api.getHeldRows).not.toHaveBeenCalled()
  })

  it('lists every held row and every held minor past the first 100 rows', async () => {
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'beneficiaries.guardian_consent.approve']
    const many = Array.from({ length: 130 }, (_, index) => held('GUARDIAN_CONSENT_REQUIRED', index))
    const big = { ...batch, totals: { ...totals, unprocessed: 130 } }
    await show(many, big as unknown as ImportBatchDefinition)
    expect(screen.getByText('First129 Last129', { selector: 'td' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve 0 selected' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Select all'))
    expect(screen.getByRole('button', { name: 'Approve 130 selected' })).toBeTruthy()
    expect(api.getHeldRows).toHaveBeenCalledWith('project-1', 'batch-1')
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  })

  it('offers no Review button without beneficiaries.records.register', async () => {
    state.profile.permissions = ['imports.read', 'imports.review']
    await show([held('PROFILE_CHANGED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
  })

  it('says so when the held rows cannot be loaded', async () => {
    api.getHeldRows.mockRejectedValue(new Error('Held rows are unavailable.'))
    render(<ImportHeldList batch={batch} onChanged={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Held rows are unavailable.')
  })
})
