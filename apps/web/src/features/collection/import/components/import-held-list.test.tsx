/* @vitest-environment jsdom */
import { importHoldCodes } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { ImportHeldList } from './import-held-list'

const state = vi.hoisted(() => ({
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['imports.read', 'imports.review'] as string[],
  },
}))
const api = vi.hoisted(() => ({ getRowReview: vi.fn(), approveGuardianConsent: vi.fn() }))
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
const show = (rows: ImportRowDefinition[], current = batch) =>
  render(<ImportHeldList batch={current} onChanged={vi.fn()} rows={rows} />)

describe('import held list', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile.permissions = ['imports.read', 'imports.review']
  })
  afterEach(cleanup)

  it('each code has a plain reason', () => {
    show(importHoldCodes.map(held))
    const reasons = importHoldCodes.map((_code, index) => {
      const row = screen.getByText(`First${index} Last${index}`).closest('tr') as HTMLElement
      return within(row).getAllByRole('cell')[2].textContent ?? ''
    })
    for (const reason of reasons) expect(reason).toMatch(/^[A-Z][a-z]+( [A-Za-z0-9,-]+)+$/)
    expect(new Set(reasons).size).toBe(importHoldCodes.length)
    expect(reasons[importHoldCodes.indexOf('PROFILE_CHANGED')]).toBe('Values differ from PATHWAYS')
  })

  it('shows the batch result counts', () => {
    show([held('PROFILE_CHANGED', 0)])
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

  it('names each participant from the mapped name columns', () => {
    show([held('PROFILE_CHANGED', 0)])
    expect(screen.getByText('First0 Last0')).toBeTruthy()
  })

  it('offers Review only for rows a data reviewer can resolve', async () => {
    api.getRowReview.mockReturnValue(new Promise(() => {}))
    show([held('PROFILE_CHANGED', 0), held('GUARDIAN_CONSENT_REQUIRED', 1)])
    expect(screen.getAllByRole('button', { name: /^Review/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Review row 2' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.getRowReview).toHaveBeenCalledWith('project-1', 'batch-1', 'row-0')
  })

  it('shows the held minors to a data reviewer without any Approve control', () => {
    show([held('GUARDIAN_CONSENT_REQUIRED', 0)])
    expect(screen.getByText('Under 18, waiting for guardian approval')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
  })

  it('offers the guardian panel to an approving officer', () => {
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'beneficiaries.guardian_consent.approve']
    show([held('GUARDIAN_CONSENT_REQUIRED', 0)])
    expect(screen.getByRole('region', { name: 'Guardian approval' })).toBeTruthy()
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  })

  it('shows no Review button without imports.review', () => {
    state.profile.permissions = ['imports.read']
    show([held('PROFILE_CHANGED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
  })

  it('shows nothing for a batch with no held rows and no counts', () => {
    const quiet = { ...batch, registrationCounts: undefined, totals: { ...totals, unprocessed: 0 } }
    const { container } = show([], quiet as unknown as ImportBatchDefinition)
    expect(container.textContent).toBe('')
  })
})
