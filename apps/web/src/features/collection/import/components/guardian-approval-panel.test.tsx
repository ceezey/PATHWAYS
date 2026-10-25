/* @vitest-environment jsdom */
import { importCheckpointRows } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'

import { GuardianApprovalPanel } from './guardian-approval-panel'

const state = vi.hoisted(() => ({
  profile: {
    roles: ['PROJECT_OFFICER'],
    permissions: ['imports.read', 'beneficiaries.guardian_consent.approve'],
  },
}))
const api = vi.hoisted(() => ({ approveGuardianConsent: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/api/imports', () => ({ importsClient: api }))

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `row-${index + 1}`,
    rowNumber: index + 2,
    name: `Minor ${index + 1}`,
  }))
const onApproved = vi.fn()
const show = (count: number) =>
  render(
    <GuardianApprovalPanel
      batchId="batch-1"
      onApproved={onApproved}
      projectId="project-1"
      rows={rows(count)}
    />,
  )
const approveButton = () => screen.getByRole('button', { name: /^Approve/ }) as HTMLButtonElement
const sizes = () =>
  api.approveGuardianConsent.mock.calls.map(
    (call) => (call[2] as { rowIds: string[] }).rowIds.length,
  )

describe('guardian approval panel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = ['imports.read', 'beneficiaries.guardian_consent.approve']
    api.approveGuardianConsent.mockImplementation(
      async (_project: string, _batch: string, body: { rowIds: string[] }) => ({
        approved: body.rowIds.length,
      }),
    )
  })
  afterEach(cleanup)

  it('select all then approve sends every row id', async () => {
    show(3)
    expect(approveButton().disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(approveButton())
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1))
    expect(api.approveGuardianConsent).toHaveBeenCalledTimes(1)
    expect(api.approveGuardianConsent).toHaveBeenCalledWith('project-1', 'batch-1', {
      rowIds: ['row-1', 'row-2', 'row-3'],
    })
  })

  it('sends the optional details when filled in', async () => {
    show(1)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.change(screen.getByLabelText('Guardian name (optional)'), {
      target: { value: ' Maria Cruz ' },
    })
    fireEvent.change(screen.getByLabelText('Consent date (optional)'), {
      target: { value: '2026-10-20' },
    })
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'On paper' } })
    fireEvent.click(approveButton())
    await waitFor(() => expect(onApproved).toHaveBeenCalled())
    expect(api.approveGuardianConsent.mock.calls[0][2]).toEqual({
      rowIds: ['row-1'],
      guardianName: 'Maria Cruz',
      consentDate: '2026-10-20',
      note: 'On paper',
    })
  })

  it('splits a large selection into requests of at most the checkpoint size', async () => {
    show(importCheckpointRows + 5)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(approveButton())
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1))
    expect(sizes()).toEqual([importCheckpointRows, 5])
  })

  it('stops at the first failure and shows the server message', async () => {
    api.approveGuardianConsent
      .mockResolvedValueOnce({ approved: importCheckpointRows })
      .mockRejectedValueOnce(
        new PathwaysClientError('This row can no longer be approved here.', 'invalid', [], 409),
      )
    show(importCheckpointRows * 2 + 1)
    fireEvent.click(screen.getByLabelText('Select all'))
    fireEvent.click(approveButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This row can no longer be approved here.')
    expect(api.approveGuardianConsent).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1))
  })

  it('hidden without permission', () => {
    state.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    state.profile.permissions = ['imports.read', 'imports.review']
    show(2)
    expect(screen.queryByRole('region', { name: 'Guardian approval' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
  })
})
