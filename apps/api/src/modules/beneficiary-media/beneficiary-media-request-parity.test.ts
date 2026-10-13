import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { reserveBeneficiaryMediaRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ReserveBeneficiaryMediaDto } from './beneficiary-media.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(reserveBeneficiaryMediaRequest)

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// Copies a validated DTO, and each nested file DTO, into plain objects.
const plain = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(plain)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
      : value

// The old route: the global pipe with the DTO as design type, on a fresh copy of the body.
async function viaDto(body: unknown): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: ReserveBeneficiaryMediaDto,
    })
    return { accepted: true, value: plain(dto) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(body: unknown): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: Object,
    })
    return { accepted: true, value: zodPipe.transform(value) }
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
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}
const reserve = (patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  files: [{ ...file, ...patch }],
  ...extra,
})

const accepted = [
  reserve({}),
  reserve({}, { note: 'Visit photo' }),
  reserve({}, { note: '' }),
  reserve({}, { note: null }),
  reserve({}, { note: 'x'.repeat(500) }),
  reserve({ fileName: 'x'.repeat(128) }),
  reserve({ fileName: 'back\\slash.png', contentType: 'image/png' }),
  reserve({ contentType: 'image/webp' }),
  reserve({ contentType: 'video/mp4' }),
  reserve({ contentType: 'video/quicktime' }),
  reserve({ contentType: 'video/webm' }),
  reserve({ byteSize: 1 }),
  reserve({ byteSize: 104_857_600 }),
  { files: Array.from({ length: 10 }, (_, i) => ({ ...file, fileName: `p${i}.jpg` })) },
]

const denied = [
  {},
  { files: [] },
  { files: null },
  { files: 'x' },
  { files: [1] },
  { files: Array.from({ length: 11 }, () => file) },
  reserve({ fileName: '' }),
  reserve({ fileName: 'x'.repeat(129) }),
  reserve({ fileName: 'a/b.jpg' }),
  reserve({ fileName: 1 }),
  reserve({ contentType: 'application/pdf' }),
  reserve({ contentType: 'image/gif' }),
  reserve({ contentType: 'IMAGE/JPEG' }),
  reserve({ byteSize: 0 }),
  reserve({ byteSize: 104_857_601 }),
  reserve({ byteSize: 1.5 }),
  reserve({ byteSize: '1024' }),
  reserve({ sha256: 'A'.repeat(64) }),
  reserve({ sha256: 'a'.repeat(63) }),
  reserve({ sha256: null }),
  reserve({ extra: true }),
  reserve({}, { note: 'x'.repeat(501) }),
  reserve({}, { note: 5 }),
  reserve({}, { extra: true }),
]

describe('ReserveBeneficiaryMediaDto and reserveBeneficiaryMediaRequest parity', () => {
  it.each(accepted)('both accept %j with the same value', async (body) => {
    const [old, next] = await Promise.all([viaDto(body), viaZod(body)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (body) => {
    expect(await viaDto(body)).toEqual(badRequestShape)
    expect(await viaZod(body)).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO route dropped prototype keys, also inside a file; strict zod rejects them.
  it.each(['__proto__', 'constructor'])('only the contract rejects a %s key', async (key) => {
    const top = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(reserve({})).slice(1)}`)
    const nested = JSON.parse(`{"files":[{"${key}":{"a":1},${JSON.stringify(file).slice(1)}]}`)
    for (const body of [top, nested]) {
      expect((await viaDto(body)).accepted).toBe(true)
      expect(await viaZod(body)).toEqual(badRequestShape)
    }
  })
})
