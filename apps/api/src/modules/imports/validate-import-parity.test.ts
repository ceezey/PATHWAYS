import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { validateImportRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ValidateImportDto } from './imports.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(validateImportRequest)

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(json: string): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), {
      type: 'body',
      metatype: ValidateImportDto,
    })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(json: string): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: zodPipe.transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequestShape = {
  accepted: false,
  value: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}

describe('ValidateImportDto and validateImportRequest parity', () => {
  it.each([
    '{"expectedMappingRevision":1}',
    '{"expectedMappingRevision":2}',
    '{"expectedMappingRevision":1.0}',
    '{"expectedMappingRevision":2147483648}',
    '{"expectedMappingRevision":9007199254740993}',
    '{"expectedMappingRevision":1e21}',
  ])('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each([
    '{"expectedMappingRevision":0}',
    '{"expectedMappingRevision":-1}',
    '{"expectedMappingRevision":-0}',
    '{"expectedMappingRevision":1.5}',
    '{"expectedMappingRevision":"2"}',
    '{"expectedMappingRevision":"1"}',
    '{"expectedMappingRevision":null}',
    '{"expectedMappingRevision":true}',
    '{"expectedMappingRevision":[1]}',
    '{}',
    '{"expectedMappingRevision":1,"extra":true}',
    '{"expectedMappingRevision":1,"prototype":1}',
    '[]',
    '[{"expectedMappingRevision":1}]',
  ])('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json)).toEqual(badRequestShape)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO route silently dropped these keys; strict zod rejects them.
  it.each([
    '{"expectedMappingRevision":1,"__proto__":{"a":1}}',
    '{"expectedMappingRevision":1,"constructor":{"a":1}}',
  ])('only the zod contract rejects the prototype key in %s', async (json) => {
    expect((await viaDto(json)).accepted).toBe(true)
    expect(await viaZod(json)).toEqual({
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: [expect.stringContaining('Unrecognized key(s) in object')],
      },
    })
  })
})
