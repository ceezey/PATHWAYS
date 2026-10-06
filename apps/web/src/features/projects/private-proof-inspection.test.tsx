/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PrivateProofInspection } from './private-proof-inspection'

const ids = {
  activityId: '30000000-0000-4000-8000-000000000003',
  updateId: '40000000-0000-4000-8000-000000000004',
  proofId: '50000000-0000-4000-8000-000000000005',
}
const iso = '2026-09-27T00:00:00.000Z'
const context = {
  activityId: ids.activityId,
  updateId: ids.updateId,
  expectedActivityUpdatedAt: iso,
  expectedUpdateUpdatedAt: iso,
  proofs: [{ id: ids.proofId, label: 'Activity proof', expectedEvidenceUpdatedAt: iso }],
}
const client = vi.hoisted(() => ({ context: vi.fn(), inspect: vi.fn() }))
const save = vi.hoisted(() => vi.fn())
vi.mock('@/lib/services/private-proof-client', () => ({ privateProofClient: client }))
vi.mock('@/lib/services/core-feature-client', () => ({ saveCoreArtifact: save }))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly fieldErrors: unknown[] = [],
      readonly status?: number,
    ) {
      super(message)
    }
  },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    profile: { roles: ['MONITORING_AND_EVALUATION_OFFICER'], permissions: ['evidence.read'] },
  }),
}))
vi.mock('@/lib/auth/sensitive-drafts', () => ({
  useSensitiveDraftOwner: () => ({ generation: 1, key: 'k', isCurrent: () => true }),
}))

beforeEach(() => {
  client.context.mockReset().mockResolvedValue(context)
  client.inspect.mockReset()
  save.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:proof')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

const open = async () => {
  render(<PrivateProofInspection {...ids} projectId="proj" />)
  fireEvent.click(await screen.findByRole('button', { name: /Preview privately for verification/ }))
}

describe('PrivateProofInspection preview', () => {
  it('does not fetch the proof until Preview is clicked', async () => {
    render(<PrivateProofInspection {...ids} projectId="proj" />)
    await screen.findByRole('button', { name: /Preview privately/ })
    expect(client.inspect).not.toHaveBeenCalled()
  })

  it('renders a PDF in the modal, downloads with one fetch and revokes on close', async () => {
    const file = {
      blob: new Blob(['%PDF-'], { type: 'application/pdf' }),
      fileName: 'activity-proof.pdf',
    }
    client.inspect.mockResolvedValue(file)
    await open()
    expect((await screen.findByTitle('Activity proof 1')).tagName).toBe('IFRAME')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(save).toHaveBeenCalledWith(file, expect.any(Function))
    expect(client.inspect).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:proof'))
  })

  it('shows Preview not available for octet-stream but keeps Download', async () => {
    client.inspect.mockResolvedValue({
      blob: new Blob(['x'], { type: 'application/octet-stream' }),
      fileName: 'activity-proof.bin',
    })
    await open()
    await screen.findByText('Preview not available for this file type.')
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
  })

  it('shows a labelled error without leaking details', async () => {
    client.inspect.mockRejectedValue(new Error('provider stack trace'))
    await open()
    expect(
      (await screen.findAllByText(/Private inspection is unavailable/)).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/provider stack trace/)).toBeNull()
  })
})
