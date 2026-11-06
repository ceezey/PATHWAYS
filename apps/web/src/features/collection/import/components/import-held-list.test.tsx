/* @vitest-environment jsdom */
import { importHoldCodes } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { ImportHeldList } from './import-held-list'

const state = vi.hoisted(() => ({
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'imports.read',
      'imports.review',
      'beneficiaries.records.read',
      'beneficiaries.records.register',
    ] as string[],
  },
}))
const api = vi.hoisted(() => ({
  getHeldRows: vi.fn(),
  getRowReview: vi.fn(),
  approveGuardianConsent: vi.fn(),
  confirmEnrollmentDates: vi.fn(),
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
    resolvedAt: null,
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
    state.profile.permissions = [
      'imports.read',
      'imports.review',
      'beneficiaries.records.read',
      'beneficiaries.records.register',
    ]
  })
  afterEach(cleanup)

  it('each code has a plain reason', async () => {
    await show(importHoldCodes.map(held))
    const reasons = importHoldCodes.map((_code, index) => {
      const row = screen.getByText(`First${index} Last${index}`).closest('tr') as HTMLElement
      return within(row).getAllByRole('cell')[2].textContent ?? ''
    })
    for (const reason of reasons) expect(reason).toMatch(/^[A-Z][a-z]+( [A-Za-z0-9,.'-]+)+$/)
    expect(new Set(reasons).size).toBe(importHoldCodes.length)
    expect(reasons[importHoldCodes.indexOf('PROFILE_CHANGED')]).toBe('Values differ from PATHWAYS')
  })

  it('each stage code has a plain reason', async () => {
    const expected = {
      STAGE_CHANGED: 'Answers differ from PATHWAYS',
      STAGE_DATE_MISSING: 'This survey has answers but no date',
      STAGE_DATE_OUTSIDE_ENROLLMENT: "The survey date is outside this person's enrollment",
      STAGE_IDENTITY_MISMATCH: "The name or ID differs from the participant's profile",
      STAGE_CONSENT_MISSING: 'Consent is not recorded for this survey. Upload a corrected file.',
    }
    const withScore = { ...batch, totals: { ...totals, unprocessed: 5, invalid: 1 } }
    await show(
      [...Object.keys(expected).map(held), invalid('TOTAL_SCORE_MISMATCH', 5)],
      withScore as unknown as ImportBatchDefinition,
    )
    const reasonOf = (index: number) =>
      within(
        screen.getByText(`First${index} Last${index}`).closest('tr') as HTMLElement,
      ).getAllByRole('cell')[2].textContent
    Object.values(expected).forEach((reason, index) => expect(reasonOf(index)).toBe(reason))
    expect(reasonOf(5)).toBe('The total score does not match the answer key')
  })

  it('a survey part lists its invalid rows as held and shows no Updated', async () => {
    const survey = {
      ...batch,
      formType: 'TRAINING_SURVEY',
      parentBatchId: 'parent-1',
      registrationCounts: { created: 3, updated: 0, unchanged: 1 },
      totals: { ...totals, unprocessed: 0, invalid: 1 },
    } as unknown as ImportBatchDefinition
    await show([invalid('TOTAL_SCORE_MISMATCH', 0)], survey)
    expect(api.getHeldRows).toHaveBeenCalledWith('project-1', 'batch-1')
    expect(screen.getByText('The total score does not match the answer key')).toBeTruthy()
    const results = within(screen.getByRole('group', { name: 'Import results' }))
    expect(results.getByText('Held').parentElement?.textContent).toContain('1')
    expect(results.queryByText('Updated')).toBeNull()
  })

  it('words a client ID conflict by where it comes from', async () => {
    const withInvalid = { ...batch, totals: { ...totals, unprocessed: 1, invalid: 1 } }
    await show(
      [held('IDENTITY_CONFLICT', 0), invalid('IDENTITY_CONFLICT', 1)],
      withInvalid as unknown as ImportBatchDefinition,
    )
    // A processing hold means the ID belongs to a participant whose details differ.
    expect(
      screen.getByText('Client ID belongs to a participant with different details'),
    ).toBeTruthy()
    // An invalid row means the file uses the ID twice.
    expect(screen.getByText('Client ID is used more than once')).toBeTruthy()
  })

  it('the review window gives an invalid row the list reason', async () => {
    api.getRowReview.mockResolvedValue({
      rowId: 'row-1',
      rowNumber: 3,
      reason: 'IDENTITY_CONFLICT',
      participant: null,
      canAddNew: true,
      fields: [],
    })
    const withInvalid = { ...batch, totals: { ...totals, unprocessed: 0, invalid: 1 } }
    await show([invalid('IDENTITY_CONFLICT', 1)], withInvalid as unknown as ImportBatchDefinition)
    fireEvent.click(screen.getByRole('button', { name: 'Review row 3' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/Client ID is used more than once\./)).toBeTruthy()
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

  it('offers Review for rows a data reviewer can resolve, guardian rows included until they are resolved', async () => {
    api.getRowReview.mockReturnValue(new Promise(() => {}))
    const parked = {
      ...held('GUARDIAN_CONSENT_REQUIRED', 2),
      resolvedAt: '2026-10-20T00:00:00.000Z',
    } as ImportRowDefinition
    await show([held('PROFILE_CHANGED', 0), held('GUARDIAN_CONSENT_REQUIRED', 1), parked])
    expect(screen.getAllByRole('button', { name: /^Review/ }).map((b) => b.ariaLabel)).toEqual([
      'Review row 2',
      'Review row 3',
    ])
    expect(screen.queryByRole('button', { name: 'Review row 4' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review row 3' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.getRowReview).toHaveBeenCalledWith('project-1', 'batch-1', 'row-1')
  })

  it('never offers Review to an approving officer', async () => {
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'beneficiaries.guardian_consent.approve']
    await show([held('GUARDIAN_CONSENT_REQUIRED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
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

  describe('the enrollment dates panel', () => {
    const timed = (order: string | null) =>
      ({
        ...batch,
        uploadedAt: '2026-02-01T00:00:00Z',
        sourceColumns: [{ key: 'column_0003', header: 'Timestamp', columnIndex: 3 }],
        submissionTimeDateOrder: order,
      }) as unknown as ImportBatchDefinition
    const row = (index: number, time: string) => ({
      ...held('ENROLLMENT_DATE_REQUIRED', index),
      rawData: { column_0001: `First${index}`, column_0002: `Last${index}`, column_0003: time },
    })
    const rows = [row(0, '03/01/2026 10:21:44'), row(1, '31/01/2026 08:00:00')]

    it("is offered to a processor, proposing from the submission time in the server's date order", async () => {
      state.profile.permissions = ['imports.read', 'imports.process']
      await show(rows, timed('MDY'))
      expect(screen.getByRole('region', { name: 'Enrollment dates to confirm' })).toBeTruthy()
      expect(screen.getByLabelText('Row 2: First0 Last0, proposed 2026-03-01')).toBeTruthy()
      expect(screen.getByLabelText('Row 3: First1 Last1, No submission time')).toBeTruthy()
    })

    it('guesses no order from the held rows when the server gives none', async () => {
      state.profile.permissions = ['imports.read', 'imports.process']
      await show(rows, timed(null))
      expect(screen.getByLabelText('Row 2: First0 Last0, No submission time')).toBeTruthy()
    })
  })

  it('hides the enrollment dates panel without imports.process', async () => {
    await show([held('ENROLLMENT_DATE_REQUIRED', 0)])
    expect(screen.queryByRole('region', { name: 'Enrollment dates to confirm' })).toBeNull()
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
    expect(screen.getByText('Age is not valid')).toBeTruthy()
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

  it('offers no Review button without beneficiaries.records.read', async () => {
    state.profile.permissions = ['imports.read', 'imports.review', 'beneficiaries.records.register']
    await show([held('PROFILE_CHANGED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
  })

  it('closes the review window when a refresh drops its row', async () => {
    api.getRowReview.mockReturnValue(new Promise(() => {}))
    const view = await show([held('PROFILE_CHANGED', 0)])
    fireEvent.click(screen.getByRole('button', { name: 'Review row 2' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    api.getHeldRows.mockResolvedValue([])
    view.rerender(<ImportHeldList batch={{ ...batch }} onChanged={vi.fn()} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers no Review button without beneficiaries.records.register', async () => {
    state.profile.permissions = ['imports.read', 'imports.review', 'beneficiaries.records.read']
    await show([held('PROFILE_CHANGED', 0)])
    expect(screen.queryByRole('button', { name: /^Review/ })).toBeNull()
  })

  it('says so when the held rows cannot be loaded', async () => {
    api.getHeldRows.mockRejectedValue(new Error('Held rows are unavailable.'))
    render(<ImportHeldList batch={batch} onChanged={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Held rows are unavailable.')
  })
})
