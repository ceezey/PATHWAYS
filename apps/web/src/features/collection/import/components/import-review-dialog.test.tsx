/* @vitest-environment jsdom */
import type { ImportRowReviewResponse } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'

import { ImportReviewDialog } from './import-review-dialog'

const api = vi.hoisted(() => ({ getRowReview: vi.fn(), resolveRow: vi.fn() }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
const toast = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const review = (canAddNew = true): ImportRowReviewResponse => ({
  rowId: 'row-1',
  rowNumber: 5,
  reason: 'PROFILE_CHANGED',
  participant: { beneficiaryId: 'ben-1', clientId: 'SYN-1', displayName: 'Ana Cruz' },
  canAddNew,
  fields: [
    {
      code: 'first_name',
      label: 'First name',
      dataType: 'TEXT',
      options: null,
      pathways: 'Ana',
      file: 'Anna',
      fileUnusable: null,
      calculated: null,
      rule: null,
      changed: true,
    },
    {
      code: 'sex',
      label: 'Sex',
      dataType: 'SELECT',
      options: ['Female', 'Male'],
      pathways: 'Female',
      file: 'M',
      fileUnusable: null,
      calculated: null,
      rule: null,
      changed: true,
    },
    {
      code: 'birth_date',
      label: 'Birth date',
      dataType: 'DATE',
      options: null,
      pathways: '2010-01-02',
      file: '2010-01-02',
      fileUnusable: null,
      calculated: null,
      rule: null,
      changed: false,
    },
    {
      code: 'total_score',
      label: 'Total score',
      dataType: 'INTEGER',
      options: null,
      pathways: null,
      file: 7,
      fileUnusable: null,
      calculated: 9,
      rule: null,
      changed: true,
    },
    {
      code: 'consent_recorded',
      label: 'Consent recorded',
      dataType: 'BOOLEAN',
      options: null,
      pathways: true,
      file: false,
      fileUnusable: null,
      calculated: null,
      rule: null,
      changed: true,
    },
  ],
})

const onClose = vi.fn()
const onResolved = vi.fn()
const open = async (canAddNew = true, reason = 'PROFILE_CHANGED') => {
  api.getRowReview.mockResolvedValue({ ...review(canAddNew), reason })
  render(
    <ImportReviewDialog
      batchId="batch-1"
      canUpdate
      onClose={onClose}
      onResolved={onResolved}
      projectId="project-1"
      rowId="row-1"
      validationRevision={3}
    />,
  )
  return screen.findByRole('button', { name: 'First name, In this file: Anna' })
}
// jsdom has no scrollIntoView; the window calls it on the first field to fix.
const scrolled = vi.fn()
Element.prototype.scrollIntoView = scrolled
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
const sent = async () => {
  await waitFor(() => expect(api.resolveRow).toHaveBeenCalledTimes(1))
  return api.resolveRow.mock.calls[0][3]
}

describe('import review dialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.resolveRow.mockResolvedValue({ status: 'PROCESSED' })
  })
  afterEach(cleanup)

  it('clicking a file cell selects it', async () => {
    const cell = await open()
    expect(cell.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(cell)
    expect(cell.getAttribute('aria-pressed')).toBe('true')
    const pathways = screen.getByRole('button', { name: 'First name, In database: Ana' })
    expect(pathways.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows an unusable file value in a tile that cannot be picked', async () => {
    api.getRowReview.mockResolvedValue({
      ...review(),
      fields: [
        {
          code: 'enrollment_date',
          label: 'Enrollment date',
          dataType: 'DATE',
          options: null,
          pathways: null,
          file: null,
          fileUnusable: 'not-a-date',
          calculated: null,
          rule: null,
          changed: true,
        },
      ],
    })
    render(
      <ImportReviewDialog
        batchId="batch-1"
        canUpdate
        onClose={vi.fn()}
        onResolved={vi.fn()}
        projectId="project-1"
        rowId="row-1"
        validationRevision={3}
      />,
    )
    const tile = (await screen.findByRole('button', {
      name: 'Enrollment date, In this file, cannot be used: not-a-date',
    })) as HTMLButtonElement
    expect(tile.disabled).toBe(true)
    expect(tile.textContent).toContain('Cannot be used')
  })

  it('typing selects Your value', async () => {
    const cell = await open()
    fireEvent.click(cell)
    fireEvent.change(screen.getByLabelText('First name, Your value'), { target: { value: 'Anne' } })
    expect(cell.getAttribute('aria-pressed')).toBe('false')
    confirm()
    expect(await sent()).toMatchObject({
      choices: { first_name: 'OWN' },
      own: { first_name: 'Anne' },
    })
  })

  it('select field shows only form options', async () => {
    await open()
    const sex = screen.getByLabelText('Sex, Your value')
    const options = within(sex)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['Choose an answer', 'Female', 'Male'])
    fireEvent.change(sex, { target: { value: 'Male' } })
    confirm()
    expect(await sent()).toMatchObject({ choices: { sex: 'OWN' }, own: { sex: 'Male' } })
  })

  it('offers no Your value for consent and greys unchanged fields', async () => {
    await open()
    expect(screen.queryByLabelText('Consent recorded, Your value')).toBeNull()
    const unchanged = screen.getByText('Birth date').closest('tr')
    expect(unchanged?.getAttribute('data-unchanged')).toBe('true')
  })

  it('shows both sources as tiles, greys a missing one, and marks Your value optional', async () => {
    const fields = review().fields.map((field) =>
      field.code === 'first_name' ? { ...field, pathways: null } : field,
    )
    api.getRowReview.mockResolvedValue({ ...review(), fields })
    render(
      <ImportReviewDialog
        batchId="batch-1"
        canUpdate
        onClose={onClose}
        onResolved={onResolved}
        projectId="project-1"
        rowId="row-1"
        validationRevision={3}
      />,
    )
    const kept = await screen.findByRole('button', {
      name: 'Birth date, In this file: 2010-01-02',
    })
    fireEvent.click(kept)
    expect(kept.getAttribute('aria-pressed')).toBe('true')
    const missing = screen.getByRole('button', { name: 'First name, In database: No Data' })
    expect((missing as HTMLButtonElement).disabled).toBe(true)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'More information about Your value' }))
    expect(screen.getByRole('tooltip').textContent).toBe('Optional')
  })

  it('shows a calculated-only field as one labelled Calculated tile', async () => {
    await open()
    expect(screen.queryByRole('button', { name: /^Total score, In database/ })).toBeNull()
    const calculated = screen.getByRole('button', {
      name: 'Total score, Calculated by PATHWAYS: 9',
    })
    expect(calculated.textContent).toBe('Calculated9')
  })

  it('selects the only source that has a value and sends it for a changed field', async () => {
    await open()
    const only = screen.getByRole('button', { name: 'Total score, In this file: 7' })
    expect(only.getAttribute('aria-pressed')).toBe('true')
    const both = screen.getByRole('button', { name: 'First name, In this file: Anna' })
    expect(both.getAttribute('aria-pressed')).toBe('false')
    confirm()
    expect((await sent()).choices).toEqual({ total_score: 'FILE' })
  })

  it('confirm sends choices and own values', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'First name, In database: Ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Total score, Calculated by PATHWAYS: 9' }))
    fireEvent.change(screen.getByLabelText('Sex, Your value'), { target: { value: 'Male' } })
    confirm()
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
    expect(api.resolveRow).toHaveBeenCalledWith('project-1', 'batch-1', 'row-1', {
      expectedValidationRevision: 3,
      saveAs: 'UPDATE',
      choices: { first_name: 'PATHWAYS', total_score: 'CALCULATED', sex: 'OWN' },
      own: { sex: 'Male' },
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('field error shown and dialog stays open', async () => {
    api.resolveRow.mockRejectedValue(
      new PathwaysClientError(
        'Review the highlighted form fields.',
        'invalid',
        [
          {
            fieldCode: 'first_name',
            code: 'choice_required',
            message: 'Choose the value to keep.',
          },
        ],
        400,
      ),
    )
    await open()
    confirm()
    expect(await screen.findByText('Choose the value to keep.')).toBeTruthy()
    const input = screen.getByLabelText('First name, Your value')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onResolved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a server refusal that names no field', async () => {
    api.resolveRow.mockRejectedValue(
      new PathwaysClientError('This row was already resolved.', 'invalid', [], 409),
    )
    await open()
    confirm()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This row was already resolved.')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('add as new hidden when not allowed', async () => {
    await open(false)
    const saveAs = screen.getByLabelText('Save as')
    expect(within(saveAs).queryByRole('option', { name: 'Add as a new participant' })).toBeNull()
    expect(
      within(saveAs).getByRole('option', { name: 'Update the existing participant' }),
    ).toBeTruthy()
  })

  it('a new participant cannot keep the PATHWAYS value', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'First name, In database: Ana' }))
    fireEvent.change(screen.getByLabelText('Save as'), { target: { value: 'NEW' } })
    const keep = screen.getByRole('button', { name: 'First name, In database: Ana' })
    expect((keep as HTMLButtonElement).disabled).toBe(true)
    expect(keep.getAttribute('aria-pressed')).toBe('false')
    confirm()
    expect(await sent()).toMatchObject({ saveAs: 'NEW', choices: {}, own: {} })
  })

  it('an invalid row is described by its validation reason, not as needing review', async () => {
    await open(true, 'AGE_MISMATCH')
    expect(screen.getByText(/Age does not match the birth date\./)).toBeTruthy()
    expect(screen.queryByText(/Needs review/)).toBeNull()
  })

  it('a row without consent says to upload a corrected file and cannot be saved', async () => {
    await open(true, 'CONSENT_REQUIRED')
    expect(screen.getByText(/Upload a corrected file with consent recorded\./)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('an age that does not match the birth date offers the calculated value and sends it', async () => {
    api.getRowReview.mockResolvedValue({
      rowId: 'row-1',
      rowNumber: 7,
      reason: 'AGE_MISMATCH',
      participant: null,
      canAddNew: true,
      fields: [
        {
          code: 'age_stated',
          label: 'Age',
          dataType: 'INTEGER',
          options: null,
          pathways: null,
          file: 25,
          fileUnusable: null,
          calculated: 36,
          rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] },
          changed: true,
        },
        {
          code: 'birth_date',
          label: 'Birth date',
          dataType: 'DATE',
          options: null,
          pathways: null,
          file: '1990-01-01',
          fileUnusable: null,
          calculated: null,
          rule: null,
          changed: false,
        },
      ],
    })
    render(
      <ImportReviewDialog
        batchId="batch-1"
        canUpdate
        onClose={onClose}
        onResolved={onResolved}
        projectId="project-1"
        rowId="row-1"
        validationRevision={3}
      />,
    )
    const calculated = await screen.findByRole('button', {
      name: 'Age, Calculated by PATHWAYS: 36',
    })
    // Hovering the calculated tile says how the system worked the value out.
    fireEvent.mouseEnter(calculated)
    expect(screen.getByRole('tooltip').textContent).toBe(
      "The system works this out itself from the row's other answers. Age in whole years from Birth date to the upload date, to check the file's age.",
    )
    // The age and the birth date it is worked out from are highlighted, and the first is scrolled to.
    const flagged = document.querySelectorAll('tr[data-flagged="true"]')
    expect([...flagged].map((row) => row.querySelector('td')?.textContent)).toEqual([
      'Age (check this field)',
      'Birth date (check this field)',
    ])
    expect(scrolled).toHaveBeenCalledTimes(1)
    expect(scrolled.mock.contexts[0]).toBe(flagged[0])
    fireEvent.click(calculated)
    confirm()
    expect(await sent()).toMatchObject({ saveAs: 'NEW', choices: { age_stated: 'CALCULATED' } })
  })

  it('a minor who now waits for a Project Officer is said so', async () => {
    api.resolveRow.mockResolvedValue({ status: 'WAITING_FOR_PROJECT_OFFICER' })
    await open()
    confirm()
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Project Officer'))
  })

  it('Leave held closes without saving', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Leave held' }))
    expect(onClose).toHaveBeenCalled()
    expect(api.resolveRow).not.toHaveBeenCalled()
  })
})
