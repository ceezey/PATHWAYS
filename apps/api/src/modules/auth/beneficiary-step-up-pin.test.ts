import 'reflect-metadata'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  changeStepUpPinRequest,
  isAcceptableStepUpPin,
  verifyStepUpPinRequest,
} from '@pathways/shared'
import { redactSentryRequest } from '../../common/sentry'
import { ZodPipe } from '../../common/validation/zod-pipe'

// Same options as main.ts; zod-typed bodies reach the zod pipe unchanged.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const validate = async (schema: z.ZodTypeAny, value: unknown) =>
  new ZodPipe(schema).transform(await pipe.transform(value, { type: 'body', metatype: Object }))

describe('step-up PIN rules (cr-pathways-beneficiary-step-up-pin)', () => {
  it.each(['482915', '112233445566', '529317', '0864213579'])('accepts %s', (pin) => {
    expect(isAcceptableStepUpPin(pin)).toBe(true)
  })

  it.each([
    '111111',
    '123456',
    '987654',
    '0123456789',
    '12345',
    '1234567890123',
    '48291a',
    ' 482915',
    '٤٨٢٩١٥',
    '４８２９１５',
    482915,
    null,
  ])('rejects %s', (pin) => {
    expect(isAcceptableStepUpPin(pin)).toBe(false)
  })
})

describe('step-up PIN request bodies', () => {
  it('accepts only the declared string fields', async () => {
    await expect(validate(verifyStepUpPinRequest, { pin: '482915' })).resolves.toEqual({
      pin: '482915',
    })
    await expect(validate(changeStepUpPinRequest, { newPin: '529317' })).resolves.toEqual({
      newPin: '529317',
    })
  })

  it.each([
    [verifyStepUpPinRequest, { pin: '482915', sessionId: '99000000-0000-4000-8000-000000000099' }],
    [verifyStepUpPinRequest, { pin: 482915 }],
    [verifyStepUpPinRequest, { pin: '4'.repeat(33) }],
    [verifyStepUpPinRequest, {}],
    [changeStepUpPinRequest, { newPin: '529317', currentPin: 482915 }],
    [changeStepUpPinRequest, { newPin: '529317', method: 'TOTP' }],
  ] as const)('rejects a malformed body without echoing its values', async (schema, body) => {
    const error = await validate(schema, body).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(JSON.stringify((error as BadRequestException).getResponse())).not.toMatch(
      /482915|4444|99000000/,
    )
  })
})

describe('Sentry request redaction', () => {
  it('drops request bodies, cookies, headers, env and query strings', () => {
    const event = redactSentryRequest({
      type: undefined,
      request: {
        url: 'https://api.example/api/auth/step-up/pin?pin=482915',
        method: 'POST',
        data: { pin: '482915' },
        cookies: { session: 'cookie' },
        headers: { authorization: 'Bearer token' },
        query_string: 'pin=482915',
        env: { SECRET_KEY: 'abc123' },
      },
    })
    expect(event.request).toEqual({
      url: 'https://api.example/api/auth/step-up/pin',
      method: 'POST',
    })
    expect(JSON.stringify(event)).not.toMatch(/482915|Bearer|cookie|abc123/)
  })

  it('truncates a Beneficiary search query string from the request url', () => {
    const event = redactSentryRequest({
      type: undefined,
      request: {
        url: 'https://api.example/api/beneficiaries/projects/x?search=Jane%20Doe',
        method: 'GET',
      },
    })
    expect(event.request).toEqual({
      url: 'https://api.example/api/beneficiaries/projects/x',
      method: 'GET',
    })
    expect(JSON.stringify(event)).not.toMatch(/Jane/)
  })

  it('strips query strings and fragments from breadcrumb url/to/from fields', () => {
    const event = redactSentryRequest({
      type: undefined,
      breadcrumbs: [
        {
          category: 'fetch',
          type: 'http',
          data: {
            method: 'GET',
            url: 'https://api.example/api/auth/step-up/pin?pin=482915',
          },
        },
        {
          category: 'navigation',
          type: 'navigation',
          data: {
            to: 'https://app.example/beneficiaries?search=Jane%20Doe',
            from: 'https://app.example/dashboard#Jane',
          },
        },
      ],
    })
    expect(event.breadcrumbs?.[0]?.data).toEqual({
      method: 'GET',
      url: 'https://api.example/api/auth/step-up/pin',
    })
    expect(event.breadcrumbs?.[1]?.data).toEqual({
      to: 'https://app.example/beneficiaries',
      from: 'https://app.example/dashboard',
    })
    expect(JSON.stringify(event)).not.toMatch(/482915|Jane/)
  })
})
