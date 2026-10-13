import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiaryJourneyController } from './beneficiary-journey.controller'
import { BeneficiaryJourneyService } from './beneficiary-journey.service'
import { JourneyStagesController } from './journey-stages.controller'
import { JourneyStagesService } from './journey-stages.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const eventId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const participants = { saveStages: vi.fn(), transitionEnrollment: vi.fn(), correctEvent: vi.fn() }
const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
let app: INestApplication
let port: number

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [JourneyStagesController, BeneficiaryJourneyController],
    providers: [
      { provide: JourneyStagesService, useValue: participants },
      { provide: BeneficiaryJourneyService, useValue: participants },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
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
  port = (app.getHttpServer().address() as AddressInfo).port
})

beforeEach(() => {
  for (const mock of Object.values(participants)) mock.mockReset().mockResolvedValue({})
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PUT', path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const stagesPath = `/projects/${projectId}/journey-stages`
const eventsPath = `/beneficiaries/projects/${projectId}/${beneficiaryId}/journey/events`
const badRequest = {
  status: 400,
  body: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}

describe('journey request validation', () => {
  it('forwards stages with an upper-cased code and a default terminal flag', async () => {
    const result = await send('PUT', stagesPath, { stages: [{ ...stage, code: ' j3.1 ' }] })
    expect(result.status).toBe(200)
    expect(participants.saveStages).toHaveBeenCalledWith(actor, projectId, {
      stages: [{ ...stage, code: 'J3.1', terminal: false }],
    })
  })

  it('forwards a recorded event with a trimmed note', async () => {
    const body = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
    expect((await send('POST', eventsPath, { ...body, note: '  Visited  ' })).status).toBe(201)
    expect(participants.transitionEnrollment).toHaveBeenCalledWith(
      actor,
      projectId,
      beneficiaryId,
      {
        ...body,
        note: 'Visited',
      },
    )
  })

  it('forwards a correction', async () => {
    const body = { eventDate: '2026-06-02', description: 'Corrected', reason: 'Typo' }
    const result = await send('POST', `${eventsPath}/${eventId}/corrections`, body)
    expect(result.status).toBe(201)
    expect(participants.correctEvent).toHaveBeenCalledWith(
      actor,
      projectId,
      beneficiaryId,
      eventId,
      body,
    )
  })

  it.each([
    ['a stage code with a space', 'PUT', stagesPath, { stages: [{ ...stage, code: 'J3 1' }] }],
    [
      'a repeated mapped activity',
      'PUT',
      stagesPath,
      { stages: [{ ...stage, mappedActivityIds: [projectId, projectId] }] },
    ],
    [
      'a participation event type',
      'POST',
      eventsPath,
      { eventType: 'PARTICIPATION', eventDate: '2026-06-01', description: 'x' },
    ],
    [
      'a blank correction reason',
      'POST',
      `${eventsPath}/${eventId}/corrections`,
      { eventDate: '2026-06-02', description: 'x', reason: '' },
    ],
  ] as const)(
    'answers 400 for %s without calling the service',
    async (_label, method, path, body) => {
      expect(await send(method, path, body)).toEqual(badRequest)
      for (const mock of Object.values(participants)) expect(mock).not.toHaveBeenCalled()
    },
  )
})
