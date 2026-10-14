import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'
import { IdentityReviewController } from './identity-review.controller'
import { IdentityReviewService } from './identity-review.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const beneficiaries = {
  list: vi.fn(),
  register: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  enroll: vi.fn(),
}
const review = { resolve: vi.fn() }
const person = {
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [IdentityReviewController, BeneficiariesController],
    providers: [
      { provide: BeneficiariesService, useValue: beneficiaries },
      { provide: IdentityReviewService, useValue: review },
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
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/beneficiaries/projects/${projectId}`
})

beforeEach(() => {
  for (const mock of [...Object.values(beneficiaries), review.resolve])
    mock.mockReset().mockResolvedValue({ id: beneficiaryId })
})
afterAll(async () => app?.close())

// Sends a request with an optional raw JSON body and returns the status and parsed body.
async function send(method: string, url: string, body?: string) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

const badRequest = {
  status: 400,
  body: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}

describe('beneficiary request validation', () => {
  it('defaults the page size and trims the search on the list query', async () => {
    expect((await send('GET', `${base}?search=%20Ana%20`)).status).toBe(200)
    expect(beneficiaries.list).toHaveBeenCalledWith(actor, projectId, { search: 'Ana', limit: 25 })
  })

  it('coerces a numeric page size from the query string', async () => {
    expect((await send('GET', `${base}?limit=10&ageBand=0-9`)).status).toBe(200)
    expect(beneficiaries.list).toHaveBeenCalledWith(actor, projectId, { limit: 10, ageBand: '0-9' })
  })

  it.each([
    ['a page size above 50', '?limit=51'],
    ['the retired 5-9 age band', '?ageBand=5-9'],
    ['an unknown filter', '?page=2'],
  ])('answers 400 for %s without listing', async (_label, query) => {
    expect(await send('GET', `${base}${query}`)).toEqual(badRequest)
    expect(beneficiaries.list).not.toHaveBeenCalled()
  })

  it('forwards a registration with its values untouched', async () => {
    const body = {
      formId: projectId,
      clientRegistrationId: beneficiaryId,
      values: { beneficiary_code: 'BEN-1', is_minor: false },
    }
    expect((await send('POST', `${base}/registrations`, JSON.stringify(body))).status).toBe(201)
    expect(beneficiaries.register).toHaveBeenCalledWith(actor, projectId, body)
  })

  it('forwards a profile update with null optional fields', async () => {
    const body = { ...person, middleName: null, birthDate: null, ageAtRegistration: 30 }
    const result = await send('PATCH', `${base}/${beneficiaryId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(beneficiaries.update).toHaveBeenCalledWith(actor, projectId, beneficiaryId, body)
  })

  it.each([
    ['an impossible birth date', 'PATCH', '', { ...person, birthDate: '2026-02-30' }],
    ['a numeric-string age', 'PATCH', '', { ...person, ageAtRegistration: '30' }],
    ['an unparseable version', 'POST', '/archive', { expectedUpdatedAt: 'yesterday' }],
    ['an impossible enrollment date', 'POST', '/enrollments', { enrollmentDate: '2026-02-29' }],
  ])('answers 400 for %s without calling the service', async (_label, method, path, body) => {
    expect(await send(method, `${base}/${beneficiaryId}${path}`, JSON.stringify(body))).toEqual(
      badRequest,
    )
    for (const mock of Object.values(beneficiaries)) expect(mock).not.toHaveBeenCalled()
  })

  it('forwards an archive and an enrollment', async () => {
    const archive = { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
    const enroll = { enrollmentDate: '2026-01-01' }
    await send('POST', `${base}/${beneficiaryId}/archive`, JSON.stringify(archive))
    await send('POST', `${base}/${beneficiaryId}/enrollments`, JSON.stringify(enroll))
    expect(beneficiaries.archive).toHaveBeenCalledWith(actor, projectId, beneficiaryId, archive)
    expect(beneficiaries.enroll).toHaveBeenCalledWith(actor, projectId, beneficiaryId, enroll)
  })

  it('validates a duplicate decision before the identity review service', async () => {
    const url = `${base}/duplicate-candidates/resolve`
    const body = { leftId: projectId, rightId: beneficiaryId, decision: 'LINK' }
    expect((await send('POST', url, JSON.stringify(body))).status).toBe(201)
    expect(review.resolve).toHaveBeenCalledWith(actor, projectId, body)
    review.resolve.mockClear()
    expect(await send('POST', url, JSON.stringify({ ...body, decision: 'MERGE' }))).toEqual(
      badRequest,
    )
    expect(review.resolve).not.toHaveBeenCalled()
  })
})
