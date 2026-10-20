// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation,
}))

import { activityExtensionsClient } from './activity-extensions'

const projectId = '75200000-0000-4000-8000-000000000001'
const activityId = '75200000-0000-4000-8000-000000000002'
const requestId = '75200000-0000-4000-8000-000000000003'
const path = `/projects/${projectId}/activities/${activityId}/extension-requests`

const extension = {
  id: requestId,
  projectId,
  activityId,
  currentEndDate: '2026-02-01',
  requestedEndDate: '2026-03-01',
  reason: 'The venue was unavailable.',
  status: 'PENDING',
  requestedBy: { id: '75200000-0000-4000-8000-000000000004', name: 'Ana Cruz' },
  requestedAt: '2026-09-28T00:00:00.000Z',
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: '2026-09-28T00:00:00.000Z',
}

const client = activityExtensionsClient

describe('activityExtensionsClient extension requests', () => {
  beforeEach(() => requestFoundation.mockReset())

  it('lists the extensions of an activity and parses each row', async () => {
    requestFoundation.mockResolvedValue([extension])
    await expect(client.listActivityExtensions(projectId, activityId)).resolves.toEqual([extension])
    expect(requestFoundation).toHaveBeenCalledWith(path)
  })

  it('refuses a row with an unknown key', async () => {
    requestFoundation.mockResolvedValue([{ ...extension, note: 'extra' }])
    await expect(client.listActivityExtensions(projectId, activityId)).rejects.toThrow()
  })

  it('requests an extension with the given body', async () => {
    requestFoundation.mockResolvedValue(extension)
    const input = {
      requestedEndDate: '2026-03-01',
      reason: 'The venue was unavailable.',
      clientMutationId: '75200000-0000-4000-8000-000000000005',
    }
    await expect(client.requestActivityExtension(projectId, activityId, input)).resolves.toEqual(
      extension,
    )
    expect(requestFoundation).toHaveBeenCalledWith(path, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  })

  it('verifies and decides under the request id', async () => {
    requestFoundation.mockResolvedValue({ ...extension, status: 'VERIFIED' })
    const verify = {
      decision: 'VERIFY' as const,
      note: 'Verified with the officer.',
      expectedUpdatedAt: extension.updatedAt,
    }
    await client.verifyActivityExtension(projectId, activityId, 'r/1', verify)
    expect(requestFoundation).toHaveBeenLastCalledWith(`${path}/r%2F1/verify`, {
      method: 'POST',
      body: JSON.stringify(verify),
    })
    const decide = {
      decision: 'APPROVE' as const,
      note: 'Approved after review.',
      expectedUpdatedAt: extension.updatedAt,
      activityExpectedUpdatedAt: extension.updatedAt,
      clientMutationId: '75200000-0000-4000-8000-000000000006',
    }
    await client.decideActivityExtension(projectId, activityId, requestId, decide)
    expect(requestFoundation).toHaveBeenLastCalledWith(`${path}/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify(decide),
    })
  })
})
