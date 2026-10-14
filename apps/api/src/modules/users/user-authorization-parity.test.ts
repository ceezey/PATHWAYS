import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { authorizeExistingUserRequest, updateAuthorizedUserRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(metatype: new () => object, json: string): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(schema: z.ZodTypeAny, json: string): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: new ZodPipe(schema).transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
}

// Both routes accept with the same value, or both answer the 400 shape.
async function expectParity(metatype: new () => object, schema: z.ZodTypeAny, json: string) {
  const [dto, zod] = await Promise.all([viaDto(metatype, json), viaZod(schema, json)])
  expect(zod.accepted).toBe(dto.accepted)
  if (dto.accepted) expect(zod.value).toEqual(dto.value)
  else {
    expect(dto.value).toEqual(badRequest)
    expect(zod.value).toEqual(badRequest)
  }
}

const authUserId = '71000000-0000-4000-8000-000000000001'
const emoji = String.fromCodePoint(0x1f600)
const officer = { authUserId, fullName: 'A', role: 'PROJECT_OFFICER' }
const authorizeBodies = [
  { authUserId, fullName: 'Synthetic User', role: 'PROGRAM_MANAGER', projectIds: [] },
  { authUserId, fullName: '  Synthetic User  ', role: 'PROJECT_OFFICER', projectIds: [authUserId] },
  officer,
  {
    authUserId: authUserId.toUpperCase(),
    fullName: 'x'.repeat(120),
    role: 'PROJECT_OFFICER',
    projectIds: [authUserId.toUpperCase()],
  },
  { ...officer, fullName: emoji.repeat(120) },
  { ...officer, authUserId: '00000000-0000-0000-0000-000000000000' },
  { ...officer, authUserId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
  { ...officer, authUserId: '71000000-0000-0000-8000-000000000001' },
  { ...officer, authUserId: '71000000-0000-4000-0000-000000000001' },
  { ...officer, authUserId: '71000000-0000-9000-8000-000000000001' },
  { ...officer, fullName: '   ' },
  { ...officer, fullName: 'x'.repeat(121) },
  { ...officer, fullName: emoji.repeat(121) },
  { ...officer, fullName: 5 },
  { ...officer, role: 'Program Manager' },
  { ...officer, role: 'toString' },
  { ...officer, projectIds: ['x'] },
  { ...officer, projectIds: [5] },
  { ...officer, projectIds: 'x' },
  { ...officer, projectIds: Array(101).fill(authUserId) },
  { ...officer, projectIds: Array(100).fill(authUserId) },
  { ...officer, extra: 1 },
  { authUserId, fullName: 'A' },
  { fullName: 'A', role: 'PROJECT_OFFICER' },
  { ...officer, authUserId: 5 },
  [],
].map((body) => JSON.stringify(body))
const change = { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE', projectIds: [] }
const updateBodies = [
  { ...change, fullName: 'A', projectIds: [authUserId] },
  { ...change, accountStatus: 'DEACTIVATED' },
  { ...change, fullName: null },
  { ...change, fullName: '  B  ', role: 'SYSTEM_ADMINISTRATOR' },
  { ...change, fullName: '' },
  { ...change, fullName: '  ' },
  { ...change, accountStatus: 'SUSPENDED' },
  { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE' },
  { ...change, projectIds: null },
  { ...change, organizationId: authUserId },
  { ...change, authUserId },
  { accountStatus: 'ACTIVE', projectIds: [] },
].map((body) => JSON.stringify(body))

describe('users DTO and contract parity', () => {
  it.each(authorizeBodies)('authorize-existing agrees on %s', (json) =>
    expectParity(AuthorizeExistingUserDto, authorizeExistingUserRequest, json),
  )

  it.each(updateBodies)('update agrees on %s', (json) =>
    expectParity(UpdateAuthorizedUserDto, updateAuthorizedUserRequest, json),
  )

  it('keeps the class-validator message for an id the editor accepts but IsUUID() refused', async () => {
    const json = JSON.stringify({ ...officer, authUserId: '71000000-0000-0000-8000-000000000001' })
    const expected = {
      accepted: false,
      value: { statusCode: 400, error: 'Bad Request', message: ['authUserId must be a UUID'] },
    }
    expect(await viaDto(AuthorizeExistingUserDto, json)).toEqual(expected)
    expect(await viaZod(authorizeExistingUserRequest, json)).toEqual(expected)
  })

  it('keeps the class-validator message for a project list over 100, which the editor can send', async () => {
    const json = JSON.stringify({ ...officer, projectIds: Array(101).fill(authUserId) })
    const expected = {
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds must contain no more than 100 elements'],
      },
    }
    expect(await viaDto(AuthorizeExistingUserDto, json)).toEqual(expected)
    expect(await viaZod(authorizeExistingUserRequest, json)).toEqual(expected)
  })

  // Ruling 4: the DTO let a null list through to a later 403; the contract answers 400.
  it('only the contract rejects a null project list on authorize-existing', async () => {
    const json = JSON.stringify({ ...officer, projectIds: null })
    expect((await viaDto(AuthorizeExistingUserDto, json)).accepted).toBe(true)
    expect(await viaZod(authorizeExistingUserRequest, json)).toEqual({
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds Expected array, received null'],
      },
    })
  })
})
