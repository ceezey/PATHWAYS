import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiaryMediaController } from './beneficiary-media.controller'
import { BeneficiaryMediaService } from './beneficiary-media.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const media = { reserve: vi.fn() }
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [BeneficiaryMediaController],
    providers: [{ provide: BeneficiaryMediaService, useValue: media }],
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
  url = `http://127.0.0.1:${port}/beneficiaries/projects/${projectId}/${beneficiaryId}/media/reservations`
})

beforeEach(() => media.reserve.mockReset().mockResolvedValue({ files: [] }))
afterAll(async () => app?.close())

// Posts a JSON body and returns the status with the parsed response body.
async function post(body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

describe('beneficiary media reservation validation', () => {
  it('forwards declared files and a note to the service', async () => {
    const body = { files: [file], note: 'Visit photo' }
    expect((await post(body)).status).toBe(201)
    expect(media.reserve).toHaveBeenCalledWith(actor, projectId, beneficiaryId, body)
  })

  it.each([
    ['a document', { files: [{ ...file, contentType: 'application/pdf' }] }],
    ['a slash in the file name', { files: [{ ...file, fileName: 'a/b.jpg' }] }],
    ['no files', { files: [] }],
    ['an undeclared file key', { files: [{ ...file, path: '/tmp' }] }],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(media.reserve).not.toHaveBeenCalled()
  })
})
