import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgramsController } from './programs.controller'
import { ProgramsService } from './programs.service'

const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const programs = { create: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProgramsController],
    providers: [{ provide: ProgramsService, useValue: programs }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Attaches the identity the auth guard would attach.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so the route sees the production pipe chain.
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
  url = `http://127.0.0.1:${port}/programs`
})

beforeEach(() => programs.create.mockReset().mockResolvedValue({ id: 'program' }))
afterAll(async () => app?.close())

// Posts a raw JSON body and returns the status with the parsed response body.
async function post(body: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('POST programs body validation', () => {
  it('forwards a trimmed, upper-cased code and a trimmed name', async () => {
    const result = await post(
      '{"code":" prg-2026 ","name":"  Synthetic program  ","status":"ONGOING"}',
    )
    expect(result.status).toBe(201)
    expect(programs.create).toHaveBeenCalledWith(actor, {
      code: 'PRG-2026',
      name: 'Synthetic program',
      status: 'ONGOING',
    })
  })

  it.each([
    ['a missing code', '{"name":"Synthetic program","status":"ONGOING"}'],
    [
      'an impossible end date',
      '{"code":"PRG","name":"Synthetic program","status":"ONGOING","endDate":"2026-02-30"}',
    ],
    ['an unknown status', '{"code":"PRG","name":"Synthetic program","status":"ACTIVE"}'],
    ['an unknown key', '{"code":"PRG","name":"Synthetic program","status":"ONGOING","extra":1}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(programs.create).not.toHaveBeenCalled()
  })
})
