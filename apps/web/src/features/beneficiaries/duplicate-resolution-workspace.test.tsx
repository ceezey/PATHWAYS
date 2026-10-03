/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { client, session, toast } = vi.hoisted(() => ({
  toast: { success: vi.fn() },
  session: {
    profile: {
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: ['beneficiaries.identities.review'],
    } as { roles: string[]; permissions: string[] },
  },
  client: {
    getProjectsForRole: vi.fn(),
    getDuplicateCandidates: vi.fn(),
    resolveDuplicate: vi.fn(),
  },
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: 'Monitoring and Evaluation Officer',
    profile: session.profile,
  }),
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: client }))

import { DuplicateResolutionWorkspace } from './duplicate-resolution-workspace'

const profile = (id: string, code: string) => ({
  id,
  code,
  name: 'Ana Cruz',
  birthDate: '2010-05-01',
  location: 'Poblacion',
  updatedAt: '2026-09-01T00:00:00.000Z',
})
const pair = { left: profile('a', 'BEN-1'), right: profile('b', 'BEN-2') }

beforeEach(() => {
  session.profile.permissions = ['beneficiaries.identities.review']
  client.getProjectsForRole.mockResolvedValue([{ id: 'p1', title: 'Project One' }])
  client.getDuplicateCandidates.mockResolvedValue([pair])
  client.resolveDuplicate.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DuplicateResolutionWorkspace', () => {
  it('shows both decision controls for a queued pair', async () => {
    render(<DuplicateResolutionWorkspace />)
    expect(await screen.findByRole('button', { name: 'Merge linked profiles' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep as distinct people' })).toBeTruthy()
    expect(screen.getAllByText('BEN-1 / BEN-2').length).toBeGreaterThan(0)
  })

  it('sends the confirmed decision and reloads the queue', async () => {
    render(<DuplicateResolutionWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep as distinct people' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decision' }))
    await waitFor(() =>
      expect(client.resolveDuplicate).toHaveBeenCalledWith('p1', {
        leftId: 'a',
        rightId: 'b',
        decision: 'KEEP_DISTINCT',
      }),
    )
    await waitFor(() => expect(client.getDuplicateCandidates).toHaveBeenCalledTimes(2))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('kept as distinct'))
  })

  it('hides the decision controls when the profile lacks the review grant', async () => {
    session.profile.permissions = []
    render(<DuplicateResolutionWorkspace />)
    expect((await screen.findAllByText('BEN-1 / BEN-2')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Keep as distinct people' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Merge linked profiles' })).toBeNull()
  })

  it('shows an empty queue and no controls when there are no candidates', async () => {
    client.getDuplicateCandidates.mockResolvedValue([])
    render(<DuplicateResolutionWorkspace />)
    expect(await screen.findByText('No unreviewed matches were found.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Merge linked profiles' })).toBeNull()
  })

  it('shows an alert and no controls when the server denies the queue', async () => {
    client.getDuplicateCandidates.mockRejectedValue(new Error('forbidden'))
    render(<DuplicateResolutionWorkspace />)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded')
    expect(screen.queryByRole('button', { name: 'Keep as distinct people' })).toBeNull()
    expect(client.resolveDuplicate).not.toHaveBeenCalled()
  })
})
