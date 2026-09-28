import { afterEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError, pathwaysClient } from './pathways-client'

const authUserId = '73800000-0000-4000-8000-000000000001'
const projectId = '73800000-0000-4000-8000-000000000004'
const setup = (body: unknown) => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(
      JSON.stringify({
        authUserId,
        organizationId: '73800000-0000-4000-8000-000000000002',
        userId: '73800000-0000-4000-8000-000000000003',
      }),
    )}`,
  })
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
    error: null,
  })
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

const listItem = {
  id: '73800000-0000-4000-8000-000000000010',
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: '',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  assignedUserIds: [],
  assignedTo: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 0,
  progress: 0,
  updatedAt: '2026-09-28T00:00:00.000Z',
}
const detail = {
  ...listItem,
  assignedEmails: [],
  beneficiariesReached: 0,
  budgetAllocation: null,
  budgetLogged: null,
  submittedProof: [],
  updateNotes: [],
}
const allowed = { canEdit: true, canRecordProgress: true, canSubmitProof: false }

afterEach(() => vi.unstubAllGlobals())

describe('activity capability flags in the client allowlist', () => {
  it('keeps server flags on list items and on the detail read', async () => {
    setup([{ ...listItem, capabilities: allowed }])
    const [item] = await pathwaysClient.getActivities(projectId)
    expect(item?.capabilities).toEqual(allowed)
    setup({ ...detail, capabilities: allowed })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).resolves.toMatchObject({
      capabilities: allowed,
    })
  })

  it('treats a response without flags as offering no per-activity action', async () => {
    setup([listItem])
    const [item] = await pathwaysClient.getActivities(projectId)
    expect(item?.capabilities).toEqual({
      canEdit: false,
      canRecordProgress: false,
      canSubmitProof: false,
    })
  })

  it.each([
    null,
    'yes',
    { canEdit: 'true', canRecordProgress: false, canSubmitProof: false },
    { canEdit: true, canRecordProgress: false },
    { ...allowed, isAdmin: true },
  ])('rejects malformed flags %j', async (capabilities) => {
    setup([{ ...listItem, capabilities }])
    await expect(pathwaysClient.getActivities(projectId)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
    setup({ ...detail, capabilities })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
  })

  it('never copies an unknown list key past the allowlist', async () => {
    setup([{ ...listItem, capabilities: allowed, assignedEmails: ['x@example.test'] }])
    const [item] = await pathwaysClient.getActivities(projectId)
    expect(item).not.toHaveProperty('assignedEmails')
  })
})

describe('assignable Project Officer read', () => {
  it('requests the project-scoped endpoint and keeps only userId and displayName', async () => {
    const fetcher = setup([{ userId: '73800000-0000-4000-8000-000000000020', displayName: 'A' }])
    const controller = new AbortController()
    await expect(
      pathwaysClient.getAssignableProjectOfficers(projectId, controller.signal),
    ).resolves.toEqual([{ userId: '73800000-0000-4000-8000-000000000020', displayName: 'A' }])
    expect(fetcher).toHaveBeenCalledWith(
      `http://127.0.0.1:4000/api/projects/${projectId}/activities/assignable-officers`,
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it.each([
    [{ userId: 'u', displayName: 'A', email: 'a@example.test' }],
    [{ userId: 'u' }],
    [{ userId: 7, displayName: 'A' }],
    Array.from({ length: 51 }, (_, index) => ({ userId: `u${index}`, displayName: 'A' })),
    { userId: 'u', displayName: 'A' },
  ])('rejects an out-of-contract officer response %#', async (body) => {
    setup(body)
    await expect(pathwaysClient.getAssignableProjectOfficers(projectId)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
  })
})
