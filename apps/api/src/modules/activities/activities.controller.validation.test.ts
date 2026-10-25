import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, type Type, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivitiesController } from './activities.controller'
import { ActivitiesModule } from './activities.module'
import { MilestonesController } from './activity-milestones.controller'
import { ActivityUpdatesController } from './activity-updates.controller'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const updateId = '30000000-0000-4000-8000-000000000003'
const mutationId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }
const instant = '2026-09-24T00:00:00.000Z'
const methods = [
  'create',
  'update',
  'transition',
  'recordProgress',
  'recordOverdueExplanation',
  'reserveProof',
  'reviewUpdate',
  'createMilestone',
  'updateMilestone',
] as const
const activities = Object.fromEntries(methods.map((name) => [name, vi.fn()])) as Record<
  (typeof methods)[number],
  ReturnType<typeof vi.fn>
>
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ActivitiesController, ActivityUpdatesController, MilestonesController],
    // One mock answers for every service the module provides, so the test follows the service split.
    providers: (Reflect.getMetadata('providers', ActivitiesModule) as Type<unknown>[]).map(
      (provide) => ({ provide, useValue: activities }),
    ),
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches, since the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so the routes see the production pipe chain.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/projects/${projectId}`
})

beforeEach(() => {
  for (const name of methods) activities[name].mockReset().mockResolvedValue({ id: activityId })
})
afterAll(async () => app?.close())

// Sends a JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', url: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const create = {
  clientMutationId: mutationId,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}

describe('activity body validation', () => {
  it('forwards the normalized create body', async () => {
    const result = await send('POST', `${base}/activities`, {
      ...create,
      code: ' act-01 ',
      targetBeneficiaries: '50',
      budgetAllocation: ' 25000.25 ',
    })
    expect(result.status).toBe(201)
    expect(activities.create).toHaveBeenCalledWith(actor, projectId, {
      ...create,
      code: 'ACT-01',
      targetBeneficiaries: 50,
      budgetAllocation: '25000.25',
    })
  })

  it('forwards update, transition, progress, explanation and review bodies as sent', async () => {
    const update = { ...create, expectedUpdatedAt: instant }
    expect((await send('PATCH', `${base}/activities/${activityId}`, update)).status).toBe(200)
    expect(activities.update).toHaveBeenCalledWith(actor, projectId, activityId, update)

    const transition = {
      clientMutationId: mutationId,
      status: 'IN_PROGRESS',
      expectedUpdatedAt: instant,
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/transition`, transition)).status,
    ).toBe(201)
    expect(activities.transition).toHaveBeenCalledWith(actor, projectId, activityId, transition)

    const progress = { clientUpdateId: mutationId, progressPercent: 45, note: 'Halfway.' }
    expect((await send('POST', `${base}/activities/${activityId}/progress`, progress)).status).toBe(
      201,
    )
    expect(activities.recordProgress).toHaveBeenCalledWith(actor, projectId, activityId, progress)

    const explanation = {
      clientMutationId: mutationId,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/overdue-explanations`, explanation))
        .status,
    ).toBe(201)
    expect(activities.recordOverdueExplanation).toHaveBeenCalledWith(
      actor,
      projectId,
      activityId,
      explanation,
    )

    const review = {
      clientMutationId: mutationId,
      decision: 'APPROVE',
      reason: 'Verified.',
      expectedUpdatedAt: instant,
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/updates/${updateId}/review`, review))
        .status,
    ).toBe(201)
    expect(activities.reviewUpdate).toHaveBeenCalledWith(
      actor,
      projectId,
      activityId,
      updateId,
      review,
    )
  })

  it('forwards a proof reservation and the milestone bodies as sent', async () => {
    const reservation = {
      clientUpdateId: mutationId,
      progressPercent: 60,
      note: 'Sessions held.',
      files: [
        {
          fileName: 'report.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'a'.repeat(64),
        },
      ],
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/updates/reservations`, reservation))
        .status,
    ).toBe(201)
    expect(activities.reserveProof).toHaveBeenCalledWith(actor, projectId, activityId, reservation)

    const milestone = { title: 'Phase one', targetDate: '2026-03-01' }
    expect((await send('POST', `${base}/milestones`, milestone)).status).toBe(201)
    expect(activities.createMilestone).toHaveBeenCalledWith(actor, projectId, milestone)

    const milestoneId = '60000000-0000-4000-8000-000000000006'
    const change = {
      ...milestone,
      status: 'COMPLETED',
      completionDate: '2026-03-02',
      expectedUpdatedAt: instant,
    }
    expect((await send('PATCH', `${base}/milestones/${milestoneId}`, change)).status).toBe(200)
    expect(activities.updateMilestone).toHaveBeenCalledWith(actor, projectId, milestoneId, change)
  })

  it.each([
    [
      'an impossible planned date',
      'POST',
      '/activities',
      { ...create, plannedStartDate: '2026-02-30' },
    ],
    ['a null indicator list', 'POST', '/activities', { ...create, indicatorIds: null }],
    ['a null budget', 'POST', '/activities', { ...create, budgetAllocation: null }],
    [
      'an unknown status',
      'POST',
      `/activities/${activityId}/transition`,
      { clientMutationId: mutationId, status: 'COMPLETED', expectedUpdatedAt: instant },
    ],
    [
      'an out-of-range progress',
      'POST',
      `/activities/${activityId}/progress`,
      { clientUpdateId: mutationId, progressPercent: 101, note: 'x' },
    ],
    [
      'no evidence files',
      'POST',
      `/activities/${activityId}/updates/reservations`,
      { clientUpdateId: mutationId, progressPercent: 60, note: 'x', files: [] },
    ],
    [
      'a bad milestone status',
      'PATCH',
      `/milestones/${updateId}`,
      { title: 'Phase one', status: 'DONE', expectedUpdatedAt: instant },
    ],
  ] as const)(
    'answers 400 for %s without calling the service',
    async (_label, method, path, body) => {
      expect(await send(method, `${base}${path}`, body)).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: expect.arrayContaining([expect.any(String)]),
        },
      })
      for (const name of methods) expect(activities[name]).not.toHaveBeenCalled()
    },
  )

  it('answers 400 naming a retired key without calling the service', async () => {
    const result = await send('POST', `${base}/activities`, { ...create, targetGoal: 75 })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain('Unrecognized key: "targetGoal"')
    expect(activities.create).not.toHaveBeenCalled()
  })
})
