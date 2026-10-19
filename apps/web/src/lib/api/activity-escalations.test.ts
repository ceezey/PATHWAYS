// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation,
}))

import { activityEscalationsClient as client } from './activity-escalations'

const projectId = '75300000-0000-4000-8000-000000000001'
const activityId = '75300000-0000-4000-8000-000000000002'
const escalationId = '75300000-0000-4000-8000-000000000003'
const path = `/projects/${projectId}/activities/${activityId}/escalations`

const escalation = {
  id: escalationId,
  projectId,
  activityId,
  reason: 'The venue is not available.',
  status: 'OPEN',
  raisedBy: { id: '75300000-0000-4000-8000-000000000004', name: 'Ana Cruz' },
  raisedAt: '2026-10-19T00:00:00.000Z',
  forwardedBy: null,
  forwardedAt: null,
  forwardNote: null,
  resolvedBy: null,
  resolvedAt: null,
  resolutionNote: null,
  resolutionLevel: null,
  updatedAt: '2026-10-19T00:00:00.000Z',
}

describe('activityEscalationsClient', () => {
  beforeEach(() => requestFoundation.mockReset())

  it('lists the escalations of an activity and parses each row', async () => {
    requestFoundation.mockResolvedValue([escalation])
    await expect(client.listActivityEscalations(projectId, activityId)).resolves.toEqual([
      escalation,
    ])
    expect(requestFoundation).toHaveBeenCalledWith(path)
  })

  it('refuses a row with an unknown key', async () => {
    requestFoundation.mockResolvedValue([{ ...escalation, extra: 'x' }])
    await expect(client.listActivityEscalations(projectId, activityId)).rejects.toThrow()
  })

  it('raises an escalation with the given body', async () => {
    requestFoundation.mockResolvedValue(escalation)
    const input = {
      reason: 'The venue is not available.',
      clientMutationId: '75300000-0000-4000-8000-000000000005',
    }
    await expect(client.raiseActivityEscalation(projectId, activityId, input)).resolves.toEqual(
      escalation,
    )
    expect(requestFoundation).toHaveBeenCalledWith(path, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  })

  it('posts each step under the encoded escalation id', async () => {
    requestFoundation.mockResolvedValue({ ...escalation, status: 'FORWARDED' })
    const input = { note: 'Forwarded to the program.', expectedUpdatedAt: escalation.updatedAt }
    for (const step of ['forward', 'resolve', 'program-resolve'] as const) {
      await client.stepActivityEscalation(projectId, activityId, 'e/1', step, input)
      expect(requestFoundation).toHaveBeenLastCalledWith(`${path}/e%2F1/${step}`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    }
  })
})
