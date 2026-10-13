import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const clientSubmissionId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const metadata = {
  createForm: vi.fn(),
  generateForm: vi.fn(),
  publishForm: vi.fn(),
  validateValues: vi.fn(),
  saveSubmission: vi.fn(),
  listSubmissions: vi.fn(),
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [MetadataController],
    providers: [
      { provide: MetadataService, useValue: metadata },
      { provide: FormDefinitionExportService, useValue: {} },
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
  base = `http://127.0.0.1:${port}/metadata/projects/${projectId}/forms`
})

beforeEach(() => {
  for (const method of Object.values(metadata)) method.mockReset().mockResolvedValue({ id: formId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body to a forms route and returns the status.
async function send(method: string, route: string, body: string) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return response.status
}

const field = {
  code: ' FIRST_NAME ',
  label: '  First name  ',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
}

describe('metadata form bodies', () => {
  it('forwards a form with trimmed and lower-cased codes and trimmed names', async () => {
    const body = { code: ' INTAKE ', name: '  Intake form  ', formType: 'OTHER', fields: [field] }
    expect(await send('POST', '', JSON.stringify(body))).toBe(201)
    expect(metadata.createForm).toHaveBeenCalledWith(actor, projectId, {
      code: 'intake',
      name: 'Intake form',
      formType: 'OTHER',
      fields: [{ ...field, code: 'first_name', label: 'First name' }],
    })
  })

  it('answers 400 for an unknown field key or a bad publish timestamp without calling the service', async () => {
    const extra = {
      code: 'intake',
      name: 'Intake',
      formType: 'OTHER',
      fields: [{ ...field, x: 1 }],
    }
    expect(await send('POST', '', JSON.stringify(extra))).toBe(400)
    expect(await send('POST', `/${formId}/publish`, '{"expectedUpdatedAt":"not a date"}')).toBe(400)
    expect(metadata.createForm).not.toHaveBeenCalled()
    expect(metadata.publishForm).not.toHaveBeenCalled()
  })

  it('forwards a null template key and normalizes the code and name', async () => {
    const body = '{"templateKey":null,"code":" OK_CODE ","name":" Okay "}'
    expect(await send('POST', '/generate', body)).toBe(201)
    expect(metadata.generateForm).toHaveBeenCalledWith(actor, projectId, {
      templateKey: null,
      code: 'ok_code',
      name: 'Okay',
    })
  })
})

describe('metadata response values and submissions', () => {
  it('drops method-named value keys and refuses a constructor key', async () => {
    const values = '{"values":{"first_name":"Ana","toString":"x"}}'
    expect(await send('POST', `/${formId}/validate`, values)).toBe(201)
    expect(metadata.validateValues).toHaveBeenCalledWith(actor, projectId, formId, {
      first_name: 'Ana',
    })
    expect(await send('POST', `/${formId}/validate`, '{"values":{"constructor":"x"}}')).toBe(400)
    expect(metadata.validateValues).toHaveBeenCalledTimes(1)
  })

  it('forwards a submission and refuses a null beneficiary at the pipe', async () => {
    const body = { clientSubmissionId, values: { first_name: 'Ana' } }
    expect(await send('POST', `/${formId}/submissions`, JSON.stringify(body))).toBe(201)
    expect(metadata.saveSubmission).toHaveBeenCalledWith(actor, projectId, formId, body)
    const unnamed = JSON.stringify({ ...body, beneficiaryId: null })
    expect(await send('POST', `/${formId}/submissions`, unnamed)).toBe(400)
    expect(metadata.saveSubmission).toHaveBeenCalledTimes(1)
  })

  it('reads the submission page bounds as numbers, applies the defaults and refuses a large page', async () => {
    await fetch(`${base}/${formId}/submissions?offset=2&limit=5`)
    await fetch(`${base}/${formId}/submissions`)
    const refused = await fetch(`${base}/${formId}/submissions?limit=51`)
    expect(refused.status).toBe(400)
    expect(metadata.listSubmissions.mock.calls.map((call) => call[3])).toEqual([
      { offset: 2, limit: 5 },
      { offset: 0, limit: 10 },
    ])
  })
})
