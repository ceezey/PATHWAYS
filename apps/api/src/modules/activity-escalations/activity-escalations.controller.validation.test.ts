import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivityEscalationsController } from './activity-escalations.controller'
import { ActivityEscalationsService } from './activity-escalations.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const escalationId = '30000000-0000-4000-8000-000000000003'
const mutationId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }
const instant = '2026-10-19T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const service = {
  list: vi.fn(),
  raise: vi.fn(),
  forward: vi.fn(),
  resolve: vi.fn(),
  programResolve: vi.fn(),
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ActivityEscalationsController],
    providers: [{ provide: ActivityEscalationsService, useValue: service }],
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
  base = `http://127.0.0.1:${port}/projects/${projectId}/activities/${activityId}/escalations`
})

beforeEach(() => {
  for (const method of Object.values(service))
    method.mockReset().mockResolvedValue({ id: escalationId })
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

describe('escalation body validation', () => {
  it('forwards the raise and the three decision bodies as sent', async () => {
    const raised = { clientMutationId: mutationId, reason: note }
    expect((await post('', raised)).status).toBe(201)
    expect(service.raise).toHaveBeenCalledWith(actor, projectId, activityId, raised)

    const decision = { note, expectedUpdatedAt: instant }
    for (const [path, method] of [
      ['forward', service.forward],
      ['resolve', service.resolve],
      ['program-resolve', service.programResolve],
    ] as const) {
      expect((await post(`/${escalationId}/${path}`, decision)).status).toBe(201)
      expect(method).toHaveBeenCalledWith(actor, projectId, activityId, escalationId, decision)
    }
  })

  it.each([
    ['a short reason', '', { clientMutationId: mutationId, reason: 'short' }],
    ['an unknown raise key', '', { clientMutationId: mutationId, reason: note, extra: true }],
    ['a raise without a request id', '', { reason: note }],
    ['a short note', `/${escalationId}/forward`, { note: 'short', expectedUpdatedAt: instant }],
    ['a decision without the version', `/${escalationId}/resolve`, { note }],
    [
      'a decision with a client-chosen level',
      `/${escalationId}/program-resolve`,
      { note, expectedUpdatedAt: instant, level: 'PROGRAM' },
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
