/* @vitest-environment jsdom */
import { importCheckpointRows } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'

import { EnrollmentDatePanel } from './enrollment-date-panel'

const state = vi.hoisted(() => ({
  profile: { roles: ['PROJECT_OFFICER'], permissions: ['imports.read', 'imports.process'] },
}))
const api = vi.hoisted(() => ({ confirmEnrollmentDates: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))
const toast = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const headers = [
  { key: 'column_0001', header: 'Name' },
  { key: 'column_0002', header: '_submission_time' },
]
// Every row but the third carries a submission time.
const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `row-${index + 1}`,
    rowNumber: index + 2,
    name: `Person ${index + 1}`,
    rawData: { column_0002: index === 2 ? null : '2026-01-14T16:30:00Z' },
  }))
const onConfirmed = vi.fn()
// Just after Manila midnight, so the upload date in Manila is a day after the UTC date.
const uploadedAt = '2026-01-31T16:30:00Z'
const show = (count: number, columns = headers) =>
  render(
    <EnrollmentDatePanel
      batchId="batch-1"
      dateOrder={null}
      headers={columns}
      onConfirmed={onConfirmed}
      projectId="project-1"
      rows={rows(count)}
      uploadedAt={uploadedAt}
    />,
  )
const proposedButton = () =>
  screen.getByRole('button', { name: 'Use proposed dates' }) as HTMLButtonElement
const oneDateButton = () =>
  screen.getByRole('button', { name: 'Set one date' }) as HTMLButtonElement
const confirmDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Confirm enrollment dates' }))
const sizes = () =>
  api.confirmEnrollmentDates.mock.calls.map(
    (call) => (call[2] as { rowIds: string[] }).rowIds.length,
  )

describe('enrollment date panel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'imports.process']
    api.confirmEnrollmentDates.mockImplementation(
      async (_project: string, _batch: string, body: { rowIds: string[] }) => ({
        confirmed: body.rowIds.length,
        waiting: 0,
      }),
    )
  })
  afterEach(cleanup)

  it('lists each row with its name and proposed date, or that it has no submission time', () => {
    show(3)
    expect(screen.getByRole('region', { name: 'Enrollment dates to confirm' })).toBeTruthy()
    expect(screen.getByLabelText('Row 2: Person 1, proposed 2026-01-15')).toBeTruthy()
    expect(screen.getByLabelText('Row 3: Person 2, proposed 2026-01-15')).toBeTruthy()
    expect(screen.getByLabelText('Row 4: Person 3, No submission time')).toBeTruthy()
  })

  it('has no proposals when the file has no submission time column', () => {
    show(1, [headers[0]])
    expect(screen.getByLabelText('Row 2: Person 1, No submission time')).toBeTruthy()
  })

  it('select all ticks every row, and proposed dates need a proposal for each ticked row', () => {
    show(3)
    expect(proposedButton().disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Select all'))
    for (const box of screen.getAllByRole('checkbox'))
      expect((box as HTMLInputElement).checked).toBe(true)
    expect(proposedButton().disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Row 4: Person 3, No submission time'))
    expect(proposedButton().disabled).toBe(false)
  })

  it('uses the proposed dates after confirmation, sending no date', async () => {
    show(2)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(proposedButton())
    expect(screen.getByRole('dialog', { name: 'Confirm enrollment dates?' })).toBeTruthy()
    expect(api.confirmEnrollmentDates).not.toHaveBeenCalled()
    confirmDialog()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(api.confirmEnrollmentDates).toHaveBeenCalledWith('project-1', 'batch-1', {
      rowIds: ['row-1', 'row-2'],
    })
  })

  it('sets one typed date in requests of at most the checkpoint size, the upload date in Manila at most', async () => {
    show(importCheckpointRows + 5)
    fireEvent.click(screen.getByLabelText('Select all'))
    const input = screen.getByLabelText('Enrollment date') as HTMLInputElement
    expect(input.max).toBe('2026-02-01')
    expect(oneDateButton().disabled).toBe(true)
    fireEvent.change(input, { target: { value: '2026-01-20' } })
    fireEvent.click(oneDateButton())
    confirmDialog()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(sizes()).toEqual([importCheckpointRows, 5])
    for (const call of api.confirmEnrollmentDates.mock.calls) {
      expect((call[2] as { date: string }).date).toBe('2026-01-20')
    }
  })

  it('says how many rows now wait for guardian consent', async () => {
    api.confirmEnrollmentDates.mockResolvedValue({ confirmed: 2, waiting: 1 })
    show(2)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(proposedButton())
    confirmDialog()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith(
      'Confirmed 2 enrollment dates. 1 of them waits for guardian consent.',
    )
  })

  it('cancelling the confirmation sends nothing', () => {
    show(2)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(proposedButton())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.confirmEnrollmentDates).not.toHaveBeenCalled()
  })

  it('shows a refusal and leaves the rows ticked', async () => {
    api.confirmEnrollmentDates.mockRejectedValue(
      new PathwaysClientError(
        'Row 2: the enrollment date is after the upload date.',
        'invalid',
        [],
        400,
      ),
    )
    show(2)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(proposedButton())
    confirmDialog()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('after the upload date')
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    for (const box of screen.getAllByRole('checkbox'))
      expect((box as HTMLInputElement).checked).toBe(true)
  })

  it('hidden without permission', () => {
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    state.profile.permissions = ['imports.read', 'imports.review']
    show(2)
    expect(screen.queryByRole('region', { name: 'Enrollment dates to confirm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use proposed dates' })).toBeNull()
  })
})
