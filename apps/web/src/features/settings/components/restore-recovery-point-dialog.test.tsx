/* @vitest-environment jsdom */

import type { RecoveryPointListItem } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/beneficiary-step-up', async (original) => ({
  ...(await original<typeof import('@/lib/auth/beneficiary-step-up')>()),
  getBeneficiaryStepUpStatus: vi.fn().mockResolvedValue({ fresh: true, method: 'TOTP' }),
}))

import { RestoreRecoveryPointDialog } from './restore-recovery-point-dialog'

const point: RecoveryPointListItem = {
  id: '79400000-0000-4000-8000-000000000001',
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdBy: { id: '79400000-0000-4000-8000-000000000002', name: 'Synthetic Admin' },
  startedAt: '2026-11-12T05:59:59.000Z',
  capturedAt: '2026-11-12T06:00:00.000Z',
  completedAt: '2026-11-12T06:00:09.000Z',
  migrationName: '0091_backup_recovery',
  sizeBytes: 1048576,
  failureReason: null,
}

const renderDialog = (props: Partial<Parameters<typeof RestoreRecoveryPointDialog>[0]> = {}) => {
  const onConfirm = vi.fn()
  render(
    <RestoreRecoveryPointDialog
      point={point}
      organizationCode="ORG1"
      pending={false}
      error={null}
      stepUpRequired={false}
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      {...props}
    />,
  )
  return {
    onConfirm,
    confirm: () => screen.getByRole('button', { name: /^Restor/ }) as HTMLButtonElement,
  }
}

describe('RestoreRecoveryPointDialog', () => {
  afterEach(cleanup)

  it('names the point and its time and says what is replaced and kept', () => {
    renderDialog()
    const title = screen.getByRole('heading', { name: /Restore the Manual recovery point from/ })
    expect(title.textContent).toMatch(/Nov 12, 2026, 2:00\sPM/)
    expect(screen.getByText(/so you can undo this restore\./)).toBeTruthy()
    const replaced = screen.getByRole('list', { name: 'Goes back to that time' })
    expect(within(replaced).getAllByRole('listitem')).toHaveLength(8)
    expect(within(replaced).getByText('Project and activity assignments')).toBeTruthy()
    const kept = screen.getByRole('list', { name: 'Not changed' })
    expect(within(kept).getByText('Staff accounts')).toBeTruthy()
    expect(within(kept).getByText('Audit log')).toBeTruthy()
    expect(screen.queryByText(/copied back from the recovery point/)).toBeNull()
  })

  it('requires the typed organization code and sends it trimmed', async () => {
    const { onConfirm, confirm } = renderDialog()
    const input = screen.getByLabelText('Type ORG1 to confirm')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(confirm().disabled).toBe(true)
    fireEvent.change(input, { target: { value: '   ' } })
    expect(confirm().disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'ORG1 ' } })
    await waitFor(() => expect(confirm().disabled).toBe(false))
    fireEvent.click(confirm())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('ORG1'))
  })

  it('mentions file copies only for a copy point', () => {
    renderDialog({ point: { ...point, fileMode: 'copy' } })
    expect(
      screen.getByText(/Missing or changed files are copied back from the recovery point\./),
    ).toBeTruthy()
  })

  it('shows the error as an alert and disables Restore while pending', () => {
    const { confirm } = renderDialog({
      error: 'The organization code does not match.',
      pending: true,
    })
    expect(screen.getByRole('alert').textContent).toBe('The organization code does not match.')
    fireEvent.change(screen.getByLabelText('Type ORG1 to confirm'), { target: { value: 'ORG1' } })
    expect(confirm().disabled).toBe(true)
    expect(confirm().textContent).toBe('Restoring')
  })
})
