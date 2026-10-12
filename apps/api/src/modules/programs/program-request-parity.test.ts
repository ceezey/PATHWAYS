import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { createProgramRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { CreateProgramDto } from './programs.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(createProgramRequest)

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
      metatype: CreateProgramDto,
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
const base = { code: 'prg-1', name: 'Synthetic program', status: 'ONGOING' }
const body = (extra: Record<string, unknown>) => JSON.stringify({ ...base, ...extra })

describe('CreateProgramDto and createProgramRequest parity', () => {
  it.each([
    body({}),
    body({ code: ' prg-2026 ' }),
    body({ name: '  abc  ' }),
    body({ description: null }),
    body({ startDate: '2026-01-01', endDate: '2026-12-31' }),
    body({ startDate: null }),
    body({ startDate: '2026-01-01T00:00:00Z' }),
  ])('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each([
    body({ code: null }),
    JSON.stringify({ name: 'Synthetic program', status: 'ONGOING' }),
    body({ code: 'A' }),
    body({ code: '_A' }),
    body({ name: '  ab  ' }),
    body({ name: 'x'.repeat(161) }),
    body({ description: 'x'.repeat(2001) }),
    body({ startDate: '2026-02-30' }),
    body({ status: 'ACTIVE' }),
    body({ status: null }),
    body({ extra: 1 }),
    '[]',
    '{}',
  ])('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json)).toEqual(badRequestShape)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })

  // The DTO route dropped these keys and the contract rejects them.
  it.each([
    '{"code":"PRG","name":"Synthetic program","status":"ONGOING","__proto__":{"a":1}}',
    '{"code":"PRG","name":"Synthetic program","status":"ONGOING","constructor":{"a":1}}',
  ])('only the contract rejects %s', async (json) => {
    expect((await viaDto(json)).accepted).toBe(true)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })
})
