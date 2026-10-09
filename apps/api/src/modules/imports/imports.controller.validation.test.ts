import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const imports = { validate: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ImportsController],
    providers: [{ provide: ImportsService, useValue: imports }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
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
  url = `http://127.0.0.1:${port}/imports/projects/${projectId}/batches/${batchId}/validate`
})

beforeEach(() => imports.validate.mockReset().mockResolvedValue({ id: batchId }))
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

describe('POST imports validate body validation', () => {
  it('forwards a valid mapping revision to the service', async () => {
    const result = await post('{"expectedMappingRevision":2}')
    expect(result.status).toBe(201)
    expect(imports.validate).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedMappingRevision: 2,
    })
  })

  it.each([
    ['a numeric string', '{"expectedMappingRevision":"2"}'],
    ['a zero revision', '{"expectedMappingRevision":0}'],
    ['an empty body', '{}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(imports.validate).not.toHaveBeenCalled()
  })

  it('answers 400 naming an unknown key without calling the service', async () => {
    const result = await post('{"expectedMappingRevision":1,"extra":true}')
    expect(result.status).toBe(400)
    expect(result.body.message.join(' ')).toContain('extra')
    expect(imports.validate).not.toHaveBeenCalled()
  })
})
