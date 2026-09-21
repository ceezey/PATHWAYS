import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import type { JourneyStageConfig } from '@/types/pathways'
import { pathwaysClient } from './pathways-client'

const authUserId = '76000000-0000-4000-8000-000000000001'
const organizationId = '76000000-0000-4000-8000-000000000002'
const userId = '76000000-0000-4000-8000-000000000003'
const projectId = '76000000-0000-4000-8000-000000000004'
const activityId = '76000000-0000-4000-8000-000000000005'
const updateId = '76000000-0000-4000-8000-000000000006'
const stageId = '76000000-0000-4000-8000-000000000007'

const activity = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic workshop',
  description: 'P07 activity',
  activityType: 'Workshop',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-09-21',
  dueDate: '2026-09-30',
  actualStartDate: '2026-09-21',
  actualEndDate: null,
  assignedUserIds: ['76000000-0000-4000-8000-000000000008'],
  assignedTo: ['P07 Project Officer'],
  assignedEmails: ['p07.po.01@example.test'],
  indicatorIds: [],
  journeyStageIds: [stageId],
  journeyStageId: stageId,
  targetBeneficiaries: 0,
  beneficiariesReached: 0,
  budgetAllocation: 0,
  budgetLogged: 0,
  progress: 20,
  reviewedById: null,
  reviewedAt: null,
  cancellationReason: null,
  submittedProof: [],
  updateNotes: [],
  updatedAt: '2026-09-21T00:00:00.000Z',
}

function establishSession() {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
    error: null,
  })
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PATHWAYS C2/C4 browser client', () => {
  beforeEach(() => {
    browser.getSession.mockReset()
    establishSession()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('persists an activity transition and review through the scoped endpoints', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(activity))
      .mockResolvedValueOnce(json(activity))
    vi.stubGlobal('fetch', fetcher)

    await pathwaysClient.transitionActivity(
      projectId,
      activityId,
      'IN_PROGRESS',
      activity.updatedAt,
    )
    await pathwaysClient.reviewActivityUpdate(
      projectId,
      activityId,
      updateId,
      'RETURN',
      'Please revise the proof.',
      '2026-09-21T00:01:00.000Z',
    )

    expect(fetcher.mock.calls[0]?.[0]).toContain(
      `/projects/${projectId}/activities/${activityId}/transition`,
    )
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      status: 'IN_PROGRESS',
      expectedUpdatedAt: activity.updatedAt,
    })
    expect(fetcher.mock.calls[1]?.[0]).toContain(`/updates/${updateId}/review`)
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      decision: 'RETURN',
      reason: 'Please revise the proof.',
      expectedUpdatedAt: '2026-09-21T00:01:00.000Z',
    })
  })

  it('submits proof as multipart data without overriding the multipart boundary', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(activity))
    vi.stubGlobal('fetch', fetcher)
    const proof = new File(['synthetic'], 'proof.pdf', { type: 'application/pdf' })

    await pathwaysClient.submitActivityProof({
      projectId,
      activityId,
      clientUpdateId: '76000000-0000-4000-8000-000000000009',
      progress: 60,
      note: 'Synthetic proof submission',
      files: [proof],
    })

    const request = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(request.body).toBeInstanceOf(FormData)
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer synthetic-access-token',
      'X-Pathways-Organization-Id': organizationId,
      'X-Pathways-User-Id': userId,
    })
    expect((request.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    const form = request.body as FormData
    expect(form.get('progressPercent')).toBe('60')
    expect(form.get('note')).toBe('Synthetic proof submission')
    expect((form.get('files') as File).name).toBe('proof.pdf')
  })

  it('parses persisted milestones and sends optimistic updates', async () => {
    const milestone = {
      id: '76000000-0000-4000-8000-000000000010',
      organizationId,
      projectId,
      title: 'Synthetic milestone',
      description: null,
      targetDate: '2026-09-30T00:00:00.000Z',
      completionDate: null,
      status: 'PENDING',
      archivedAt: null,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json([milestone]))
      .mockResolvedValueOnce(
        json({ ...milestone, status: 'COMPLETED', completionDate: '2026-09-29T00:00:00.000Z' }),
      )
    vi.stubGlobal('fetch', fetcher)

    await expect(pathwaysClient.getMilestones(projectId)).resolves.toMatchObject([
      { title: 'Synthetic milestone', targetDate: '2026-09-30', completionDate: '' },
    ])
    await pathwaysClient.updateMilestone(projectId, milestone.id, {
      title: milestone.title,
      status: 'COMPLETED',
      completionDate: '2026-09-29',
      expectedUpdatedAt: milestone.updatedAt,
    })
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({
      status: 'COMPLETED',
      completionDate: '2026-09-29',
      expectedUpdatedAt: milestone.updatedAt,
    })
  })

  it('loads and saves exact persisted journey-stage IDs and activity mappings', async () => {
    const stage: JourneyStageConfig = {
      id: stageId,
      projectId,
      code: 'J2',
      name: 'Workshop participation',
      order: 2,
      type: 'Core',
      terminal: false,
      mappedActivityIds: [activityId],
      description: 'Core stage',
      archived: false,
      updatedAt: '2026-09-21T00:00:00.000Z',
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json([stage]))
      .mockResolvedValueOnce(json([stage]))
    vi.stubGlobal('fetch', fetcher)

    await expect(pathwaysClient.getJourneyStages(projectId)).resolves.toEqual([stage])
    await pathwaysClient.saveJourneyStages(projectId, [stage])

    expect(fetcher.mock.calls[1]?.[0]).toContain(`/projects/${projectId}/journey-stages`)
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      stages: [
        {
          id: stageId,
          code: 'J2',
          name: 'Workshop participation',
          order: 2,
          type: 'CORE',
          terminal: false,
          description: 'Core stage',
          mappedActivityIds: [activityId],
          expectedUpdatedAt: '2026-09-21T00:00:00.000Z',
        },
      ],
    })
  })

  it('loads journey history and uses append-only event/correction endpoints', async () => {
    const eventId = '76000000-0000-4000-8000-000000000011'
    const history = {
      projectId,
      beneficiaryId: '76000000-0000-4000-8000-000000000012',
      enrollmentId: '76000000-0000-4000-8000-000000000013',
      enrollmentStatus: 'ACTIVE',
      events: [
        {
          id: eventId,
          eventType: 'PARTICIPATION',
          eventDate: '2026-09-21',
          description: 'Participated',
          stageId,
          stageCodeSnapshot: 'J2',
          stageNameSnapshot: 'Workshop participation',
          activityId,
          activityCodeSnapshot: 'ACT-1',
          activityTitleSnapshot: 'Synthetic workshop',
          participationId: '76000000-0000-4000-8000-000000000014',
          participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
          correctsEventId: null,
          correctionReason: null,
          recordedAt: '2026-09-21T00:00:00.000Z',
          recordedBy: 'P07 Project Officer',
        },
      ],
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(history))
      .mockResolvedValueOnce(
        json({
          enrollmentId: history.enrollmentId,
          eventType: 'FOLLOW_UP',
          eventDate: '2026-09-22',
        }),
      )
      .mockResolvedValueOnce(json({ id: '76000000-0000-4000-8000-000000000015' }))
    vi.stubGlobal('fetch', fetcher)

    await expect(
      pathwaysClient.getBeneficiaryJourneyHistory(projectId, history.beneficiaryId),
    ).resolves.toEqual(history)
    await pathwaysClient.transitionBeneficiaryJourney(projectId, history.beneficiaryId, {
      eventType: 'FOLLOW_UP',
      eventDate: '2026-09-22',
      description: 'Follow-up check',
      stageId,
    })
    await pathwaysClient.correctBeneficiaryJourneyEvent(projectId, history.beneficiaryId, eventId, {
      eventDate: '2026-09-21',
      description: 'Corrected participation note',
      reason: 'Corrected wording',
      stageId,
    })

    expect(fetcher.mock.calls[1]?.[0]).toContain('/journey/events')
    expect(fetcher.mock.calls[2]?.[0]).toContain(`/journey/events/${eventId}/corrections`)
  })
})
