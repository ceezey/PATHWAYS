import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { updateOwnProfileRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { UpdateOwnProfileDto } from './profile.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(updateOwnProfileRequest)

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
      metatype: UpdateOwnProfileDto,
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

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
}
const at = '2026-10-09T01:02:03Z'
const base = {
  fullName: 'Ana Cruz',
  contactNumber: '+63 912 345 6789',
  expectedUpdatedAt: '2026-10-09T01:02:03.456Z',
}
const bodies = [
  base,
  { fullName: ' Ana ', contactNumber: '', expectedUpdatedAt: at },
  { fullName: 'Ana', contactNumber: '   ', expectedUpdatedAt: '2026-10-09T01:02:03+08:00' },
  { ...base, expectedUpdatedAt: '2026-10-09' },
  { ...base, expectedUpdatedAt: '2026-02-30' },
  { ...base, expectedUpdatedAt: '2026-10-09 01:02:03Z' },
  { ...base, expectedUpdatedAt: '20261009T010203Z' },
  { ...base, expectedUpdatedAt: 'yesterday' },
  { ...base, expectedUpdatedAt: 5 },
  { ...base, fullName: 'A' },
  { ...base, fullName: 'x'.repeat(81) },
  { ...base, contactNumber: '123456' },
  { ...base, contactNumber: '12345a7' },
  { ...base, contactNumber: '1'.repeat(31) },
  { ...base, contactNumber: null },
  { fullName: 'Ana', expectedUpdatedAt: at },
  { ...base, email: 'a@example.invalid' },
].map((body) => JSON.stringify(body))

describe('UpdateOwnProfileDto and the own profile contract parity', () => {
  it.each(bodies)('both agree on %s', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(zod.accepted).toBe(dto.accepted)
    if (dto.accepted) expect(zod.value).toEqual(dto.value)
    else {
      expect(dto.value).toEqual(badRequest)
      expect(zod.value).toEqual(badRequest)
    }
  })
})
