import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { changeStepUpPinRequest, verifyStepUpPinRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { signInBody } from './auth.helpers'
import { ChangeStepUpPinDto, VerifyStepUpPinDto } from './beneficiary-step-up-pin.dto'
import { SignInDto } from './signin-lockout.dto'

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

// Both routes accept with the same value, or both answer the 400 shape without echoing a secret.
async function expectParity(metatype: new () => object, schema: z.ZodTypeAny, json: string) {
  const [dto, zod] = await Promise.all([viaDto(metatype, json), viaZod(schema, json)])
  expect(zod.accepted).toBe(dto.accepted)
  if (dto.accepted) expect(zod.value).toEqual(dto.value)
  else {
    expect(dto.value).toEqual(badRequest)
    expect(zod.value).toEqual(badRequest)
    expect(JSON.stringify(zod.value)).not.toMatch(/pppp|482915|529317/)
  }
}

const emoji = String.fromCodePoint(0x1f600)
const user = { email: 'user@example.org', password: 'pppp-secret' }
const signInBodies = [
  user,
  { ...user, email: 'a!b@example.org' },
  { ...user, email: `${'a'.repeat(65)}@example.org` },
  { ...user, email: `jos${String.fromCharCode(0xe9)}@example.org` },
  { ...user, email: 'a@x-.org' },
  { ...user, email: ' user@example.org' },
  { ...user, password: '' },
  { ...user, password: 'p'.repeat(1025) },
  { ...user, password: emoji.repeat(1024) },
  { ...user, password: 5 },
  { email: 'user@example.org' },
  { ...user, remember: true },
].map((body) => JSON.stringify(body))
const verifyBodies = [
  { pin: '482915' },
  { pin: '' },
  { pin: '4'.repeat(32) },
  { pin: '4'.repeat(33) },
  { pin: 482915 },
  {},
  { pin: null },
  { pin: '482915', sessionId: '99000000-0000-4000-8000-000000000099' },
].map((body) => JSON.stringify(body))
const changeBodies = [
  { newPin: '529317' },
  { newPin: '529317', currentPin: '482915' },
  { newPin: '529317', currentPin: null },
  { newPin: '529317', currentPin: 482915 },
  { newPin: '4'.repeat(33) },
  { currentPin: '482915' },
  { newPin: '529317', method: 'TOTP' },
].map((body) => JSON.stringify(body))

describe('auth DTOs and contract parity', () => {
  it.each(signInBodies)('sign-in agrees on %s', (json) => expectParity(SignInDto, signInBody, json))

  it.each(verifyBodies)('PIN verify agrees on %s', (json) =>
    expectParity(VerifyStepUpPinDto, verifyStepUpPinRequest, json),
  )

  it.each(changeBodies)('PIN change agrees on %s', (json) =>
    expectParity(ChangeStepUpPinDto, changeStepUpPinRequest, json),
  )
})
