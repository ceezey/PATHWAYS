import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const projects = { create: vi.fn(), update: vi.fn() }
const update = {
  clientMutationId: '20000000-0000-4000-8000-000000000002',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProjectsController],
    providers: [{ provide: ProjectsService, useValue: projects }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Attaches the identity the auth guard would attach.
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
  base = `http://127.0.0.1:${port}/projects`
})

beforeEach(() => {
  projects.create.mockReset().mockResolvedValue({ id: projectId })
  projects.update.mockReset().mockResolvedValue({ id: projectId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', url: string, body: string) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('projects body validation', () => {
  it('forwards a trimmed, upper-cased code and a coerced count on create', async () => {
    const result = await send(
      'POST',
      base,
      '{"title":"  Synthetic project  ","code":" crl-ns-2026 ","targetBeneficiaries":"250","status":"PLANNED"}',
    )
    expect(result.status).toBe(201)
    expect(projects.create).toHaveBeenCalledWith(actor, {
      title: 'Synthetic project',
      code: 'CRL-NS-2026',
      targetBeneficiaries: 250,
      status: 'PLANNED',
    })
  })

  it('forwards an optimistic update with its mutation keys', async () => {
    const body = { title: 'Synthetic project', status: 'ONGOING', ...update }
    const result = await send('PATCH', `${base}/${projectId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(projects.update).toHaveBeenCalledWith(actor, projectId, body)
  })

  it.each([
    [
      'an impossible start date',
      '{"title":"Synthetic project","status":"PLANNED","startDate":"2026-02-30"}',
    ],
    ['a lower-case status', '{"title":"Synthetic project","status":"planned"}'],
    [
      'a null officer list',
      '{"title":"Synthetic project","status":"PLANNED","projectOfficerIds":null}',
    ],
    ['an empty body', '{}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await send('POST', base, body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(projects.create).not.toHaveBeenCalled()
  })

  it('answers 400 naming a retired key on update without calling the service', async () => {
    const body = { title: 'Synthetic project', status: 'PLANNED', targetGoal: 75, ...update }
    const result = await send('PATCH', `${base}/${projectId}`, JSON.stringify(body))
    expect(result.status).toBe(400)
    expect(result.body.message).toContain("Unrecognized key(s) in object: 'targetGoal'")
    expect(projects.update).not.toHaveBeenCalled()
  })
})
