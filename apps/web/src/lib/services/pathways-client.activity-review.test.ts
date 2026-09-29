import { afterEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError, pathwaysClient } from './pathways-client'
import { isSourceReplay, sourceMutationTickets } from './source-mutation'

// The exact JSON ActivitiesService.reviewUpdate returns today: the mapped activity detail
// (migrations 0042 and 0043 included) with the source acknowledgement alongside it.
const authUserId = '74400000-0000-4000-8000-000000000001'
const projectId = '74400000-0000-4000-8000-000000000004'
const activityId = '74400000-0000-4000-8000-000000000005'
const updateId = '74400000-0000-4000-8000-000000000006'
const principalKey = `${authUserId}:74400000-0000-4000-8000-000000000003`

const reviewedActivity = (kind: 'progress' | 'proof', requestId: string) => ({
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: '',
  activityType: null,
  timelineOverrideJustification: null,
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2099-12-31',
  actualStartDate: '2026-01-01',
  actualEndDate: null,
  assignedUserIds: ['74400000-0000-4000-8000-000000000007'],
  assignedTo: ['Synthetic officer'],
  assignedEmails: ['officer@example.invalid'],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 25,
  beneficiariesReached: 12,
  budgetAllocation: null,
  progress: 35,
  reviewedById: null,
  reviewedAt: null,
  cancellationReason: null,
  submittedProof:
    kind === 'proof'
      ? [
          {
            id: '74400000-0000-4000-8000-000000000008',
            updateId,
            fileName: 'site.jpg',
            status: 'Accepted',
            submittedAt: '2026-09-27T00:00:00.000Z',
            submittedBy: 'Synthetic officer',
            updateUpdatedAt: '2026-09-27T00:05:00.000Z',
            note: 'Sessions held.',
          },
        ]
      : [],
  updateNotes: [
    {
      id: updateId,
      kind,
      note: 'Sessions held.',
      progress: 35,
      beneficiariesReachedThisSession: kind === 'proof' ? 12 : null,
      status: 'Accepted',
      submittedBy: 'Synthetic officer',
      submittedAt: '2026-09-27T00:00:00.000Z',
      reviewedBy: 'Synthetic reviewer',
      reviewedAt: '2026-09-27T00:05:00.000Z',
      reviewReason: 'Synthetic scoped review',
      updatedAt: '2026-09-27T00:05:00.000Z',
    },
  ],
  updatedAt: '2026-09-27T00:05:00.000Z',
  budgetLogged: null,
  budgetLoggedEntries: null,
  overdueExplanations: [
    {
      id: '74400000-0000-4000-8000-000000000009',
      category: 'WEATHER',
      explanation: 'Heavy rains washed out the access road.',
      actorName: 'Synthetic reviewer',
      recordedAt: '2026-09-20T00:00:00.000Z',
    },
  ],
  overdueExplanationNeeded: false,
  capabilities: {
    canEdit: false,
    canRecordProgress: false,
    canSubmitProof: false,
    canExplainOverdue: true,
  },
  sourceAcknowledgement: { requestId, committed: true, replayed: false },
})

const setup = (respond: (init: RequestInit) => Response) => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(
      JSON.stringify({
        authUserId,
        organizationId: '74400000-0000-4000-8000-000000000002',
        userId: '74400000-0000-4000-8000-000000000003',
      }),
    )}`,
  })
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
    error: null,
  })
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url: string, init: RequestInit) => respond(init))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
const context = { principalKey, isCurrent: () => true }
const review = (decision: 'APPROVE' | 'RETURN') => {
  sourceMutationTickets.clear()
  return pathwaysClient.reviewActivityUpdate(
    projectId,
    activityId,
    updateId,
    decision,
    'Synthetic scoped review',
    '2026-09-27T00:00:00.000Z',
    context,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  sourceMutationTickets.clear()
})

describe('reviewActivityUpdate against the current API response shape', () => {
  it.each(['progress', 'proof'] as const)(
    'parses the full %s review response (session count, overdue explanations, capabilities, acknowledgement)',
    async (kind) => {
      // The API echoes the caller's clientMutationId in its acknowledgement.
      setup(
        (init) =>
          new Response(
            JSON.stringify(
              reviewedActivity(kind, JSON.parse(String(init.body)).clientMutationId as string),
            ),
          ),
      )
      const result = await review('APPROVE')
      expect(isSourceReplay(result)).toBe(false)
      if (isSourceReplay(result)) return
      expect(result.updateNotes[0]).toMatchObject({
        kind,
        status: 'Accepted',
        beneficiariesReachedThisSession: kind === 'proof' ? 12 : null,
      })
      expect(result.overdueExplanations).toHaveLength(1)
      expect(result.overdueExplanationNeeded).toBe(false)
      expect(result.capabilities?.canExplainOverdue).toBe(true)
      expect(result.progress).toBe(35)
    },
  )

  it('surfaces the API reason for a 409 and a 403 instead of an opaque failure', async () => {
    for (const [status, message] of [
      [409, 'This update is no longer awaiting review.'],
      [403, 'A submitter cannot review their own update.'],
    ] as const) {
      setup(() => new Response(JSON.stringify({ statusCode: status, message }), { status }))
      const error = await review('RETURN').catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(PathwaysClientError)
      expect(error).toMatchObject({ status, message })
    }
  })
})
