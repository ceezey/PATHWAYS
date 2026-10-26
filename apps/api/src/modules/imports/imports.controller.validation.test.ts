import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GuardianApprovalService } from './guardian-approval.service'
import { ImportReviewService } from './import-review.service'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const formId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const guardians = { approve: vi.fn() }
const imports = {
  validate: vi.fn(),
  saveMapping: vi.fn(),
  process: vi.fn(),
  automaticMapping: vi.fn(),
  listRows: vi.fn(),
  upload: vi.fn(),
}
let app: INestApplication
let base: string
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ImportsController],
    providers: [
      { provide: ImportsService, useValue: imports },
      { provide: ImportReviewService, useValue: {} },
      { provide: GuardianApprovalService, useValue: guardians },
    ],
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
  base = `http://127.0.0.1:${port}/imports/projects/${projectId}/batches`
  url = `${base}/${batchId}/validate`
})

beforeEach(() => {
  for (const method of Object.values(imports)) method.mockReset().mockResolvedValue({ id: batchId })
})
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

// Sends a raw JSON body to one batch route and returns the status with the parsed response body.
async function send(method: string, route: string, body: string) {
  const response = await fetch(`${base}/${batchId}/${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
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

describe('import mapping, automatic mapping and process bodies', () => {
  it('forwards a mapping with trimmed names, a lower-cased code and a trimmed value map', async () => {
    const result = await send(
      'PATCH',
      'mapping',
      JSON.stringify({
        expectedMappingRevision: 0,
        mappings: [
          {
            sourceFieldName: ' column_0001 ',
            targetFieldCode: ' SEX ',
            ignored: false,
            valueMap: [{ from: ' M ', to: ' Male ' }],
          },
        ],
      }),
    )
    expect(result.status).toBe(200)
    expect(imports.saveMapping).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedMappingRevision: 0,
      mappings: [
        {
          sourceFieldName: 'column_0001',
          targetFieldCode: 'sex',
          ignored: false,
          valueMap: [{ from: 'M', to: 'Male' }],
        },
      ],
    })
  })

  it.each([
    ['a formula-like value map entry', '[{"from":"M","to":"=HYPERLINK(1)"}]'],
    ['an empty value map', '[]'],
  ])('answers 400 for %s without calling the service', async (_label, valueMap) => {
    const body = `{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","targetFieldCode":"sex","ignored":false,"valueMap":${valueMap}}]}`
    expect(await send('PATCH', 'mapping', body)).toEqual({ status: 400, body: badRequest })
    expect(imports.saveMapping).not.toHaveBeenCalled()
  })

  it('answers 400 for a third automatic mapping revision or an extra key', async () => {
    const third = await send('POST', 'automatic-mapping', '{"expectedMappingRevision":2}')
    const extra = await send(
      'POST',
      'automatic-mapping',
      '{"expectedMappingRevision":0,"target":"private"}',
    )
    expect([third.status, extra.status]).toEqual([400, 400])
    expect(imports.automaticMapping).not.toHaveBeenCalled()
  })

  it('forwards a process revision and refuses a numeric string', async () => {
    expect((await send('POST', 'process', '{"expectedValidationRevision":3}')).status).toBe(201)
    expect(imports.process).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedValidationRevision: 3,
    })
    expect(await send('POST', 'process', '{"expectedValidationRevision":"3"}')).toEqual({
      status: 400,
      body: badRequest,
    })
    expect(imports.process).toHaveBeenCalledTimes(1)
  })
})

describe('import rows query and upload fields', () => {
  it('reads the row page bounds as numbers and applies the defaults', async () => {
    await fetch(`${base}/${batchId}/rows?offset=5&take=10`)
    await fetch(`${base}/${batchId}/rows`)
    expect(imports.listRows.mock.calls.map((call) => call[3])).toEqual([
      { offset: 5, take: 10 },
      { offset: 0, take: 50 },
    ])
  })

  it.each(['take=0', 'offset=-1', 'offset=1&offset=2', 'page=1'])(
    'answers 400 for the row query %s without calling the service',
    async (query) => {
      const response = await fetch(`${base}/${batchId}/rows?${query}`)
      expect(response.status).toBe(400)
      expect(imports.listRows).not.toHaveBeenCalled()
    },
  )

  it('forwards the multipart fields and the file, and refuses an invalid form id', async () => {
    const form = (id: string) => {
      const body = new FormData()
      body.set('formId', id)
      body.set('clientImportId', batchId)
      body.set('file', new Blob(['name\nAna\n'], { type: 'text/csv' }), 'register.csv')
      return body
    }
    const accepted = await fetch(`${base}/upload`, { method: 'POST', body: form(formId) })
    const refused = await fetch(`${base}/upload`, { method: 'POST', body: form('not-a-uuid') })
    expect([accepted.status, refused.status]).toEqual([201, 400])
    expect(imports.upload).toHaveBeenCalledTimes(1)
    expect(imports.upload).toHaveBeenCalledWith(
      actor,
      projectId,
      { formId, clientImportId: batchId },
      expect.objectContaining({ originalname: 'register.csv', mimetype: 'text/csv' }),
    )
  })
})

describe('POST imports guardian-approvals body validation', () => {
  const rowId = '60000000-0000-4000-8000-000000000006'

  it('forwards a valid approval to the service', async () => {
    guardians.approve.mockReset().mockResolvedValue({ approved: 1 })
    const result = await send('POST', 'guardian-approvals', `{"rowIds":["${rowId}"]}`)
    expect(result).toEqual({ status: 201, body: { approved: 1 } })
    expect(guardians.approve).toHaveBeenCalledWith(actor, projectId, batchId, { rowIds: [rowId] })
  })

  it.each([
    ['no rows', '{"rowIds":[]}'],
    ['a duplicate row', `{"rowIds":["${rowId}","${rowId}"]}`],
    ['an unknown key', `{"rowIds":["${rowId}"],"extra":true}`],
    ['a malformed consent date', `{"rowIds":["${rowId}"],"consentDate":"2026-13-40"}`],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    guardians.approve.mockReset()
    expect(await send('POST', 'guardian-approvals', body)).toEqual({
      status: 400,
      body: badRequest,
    })
    expect(guardians.approve).not.toHaveBeenCalled()
  })
})
