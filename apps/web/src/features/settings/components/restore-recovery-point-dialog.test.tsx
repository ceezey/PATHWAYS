/* @vitest-environment jsdom */

import type { RecoveryPointListItem } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stepUp = vi.hoisted(() => ({ status: vi.fn(), verify: vi.fn() }))

vi.mock('@/lib/auth/beneficiary-step-up', async (original) => ({
  ...(await original<typeof import('@/lib/auth/beneficiary-step-up')>()),
  getBeneficiaryStepUpStatus: stepUp.status,
  verifyBeneficiaryStepUp: stepUp.verify,
}))

import { BeneficiaryStepUpError } from '@/lib/auth/beneficiary-step-up'
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
  beforeEach(() => {
    stepUp.status.mockReset().mockResolvedValue({ fresh: true, method: 'TOTP' })
    stepUp.verify.mockReset().mockResolvedValue(undefined)
  })
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

  it('ties the server error to the organization code field', () => {
    renderDialog({ error: 'The organization code does not match.' })
    const alert = screen.getByRole('alert')
    expect(alert.id).toBe('restore-error')
    const input = screen.getByLabelText('Type ORG1 to confirm')
    expect(input.getAttribute('aria-describedby')).toBe('restore-error')
  })

  it('leaves the organization code field untied when there is no server error', () => {
    renderDialog()
    const input = screen.getByLabelText('Type ORG1 to confirm')
    expect(input.getAttribute('aria-describedby')).toBeNull()
  })

  it('shows a rejected code once, tied to the code field', async () => {
    stepUp.status.mockResolvedValue({ fresh: false, method: null })
    stepUp.verify.mockRejectedValue(new BeneficiaryStepUpError('Rejected.', 'rejected'))
    const { onConfirm, confirm } = renderDialog()
    fireEvent.change(screen.getByLabelText('Type ORG1 to confirm'), { target: { value: 'ORG1' } })
    await screen.findByRole('group', { name: 'Authenticator code' })
    const box = screen.getByRole('textbox', { name: 'Digit 1 of 6' })
    fireEvent.change(box, { target: { value: '123456' } })
    fireEvent.click(confirm())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('The code was not accepted. Try the next authenticator code.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(alert.id).toBe('step-up-code-error')
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(box.getAttribute('aria-describedby')).toBe('step-up-code-error')
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
