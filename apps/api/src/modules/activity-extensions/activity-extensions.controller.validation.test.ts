import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivityExtensionsController } from './activity-extensions.controller'
import { ActivityExtensionsService } from './activity-extensions.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const requestId = '30000000-0000-4000-8000-000000000003'
const mutationId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }
const instant = '2026-09-24T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const service = { list: vi.fn(), request: vi.fn(), verify: vi.fn(), decide: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ActivityExtensionsController],
    providers: [{ provide: ActivityExtensionsService, useValue: service }],
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
  base = `http://127.0.0.1:${port}/projects/${projectId}/activities/${activityId}/extension-requests`
})

beforeEach(() => {
  for (const method of Object.values(service))
    method.mockReset().mockResolvedValue({ id: requestId })
})
afterAll(async () => app?.close())

// Sends a JSON body and returns the status with the parsed response body.
async function post(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

describe('extension request body validation', () => {
  it('forwards the request, verify and decide bodies as sent', async () => {
    const created = { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: note }
    expect((await post('', created)).status).toBe(201)
    expect(service.request).toHaveBeenCalledWith(actor, projectId, activityId, created)

    const verify = { decision: 'VERIFY', note, expectedUpdatedAt: instant }
    expect((await post(`/${requestId}/verify`, verify)).status).toBe(201)
    expect(service.verify).toHaveBeenCalledWith(actor, projectId, activityId, requestId, verify)

    const decide = {
      clientMutationId: mutationId,
      decision: 'APPROVE',
      note,
      expectedUpdatedAt: instant,
      activityExpectedUpdatedAt: instant,
    }
    expect((await post(`/${requestId}/decide`, decide)).status).toBe(201)
    expect(service.decide).toHaveBeenCalledWith(actor, projectId, activityId, requestId, decide)
  })

  it.each([
    [
      'a timestamp as the requested end date',
      '',
      { clientMutationId: mutationId, requestedEndDate: instant, reason: note },
    ],
    [
      'a short reason',
      '',
      { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: 'short' },
    ],
    [
      'an unknown verify decision',
      `/${requestId}/verify`,
      { decision: 'APPROVE', note, expectedUpdatedAt: instant },
    ],
    [
      'a decide body without the activity version',
      `/${requestId}/decide`,
      { clientMutationId: mutationId, decision: 'DECLINE', note, expectedUpdatedAt: instant },
    ],
    [
      'an unknown key',
      '',
      { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: note, extra: true },
    ],
  ])('answers 400 for %s without calling the service', async (_label, path, body) => {
    expect(await post(path, body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled()
  })
})
