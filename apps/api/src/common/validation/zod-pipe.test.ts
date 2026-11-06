import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ZodPipe } from './zod-pipe'

// The 400 response a pipe threw, or a failure when it did not throw a BadRequestException.
function badRequest(run: () => unknown) {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    return (error as BadRequestException).getResponse()
  }
  throw new Error('Expected a BadRequestException.')
}

describe('ZodPipe', () => {
  it('returns the schema output', () => {
    const pipe = new ZodPipe(z.object({ take: z.coerce.number().int() }).strict())
    expect(pipe.transform({ take: '5' })).toEqual({ take: 5 })
  })

  it('answers the class-validator 400 shape with path-prefixed messages', () => {
    const pipe = new ZodPipe(
      z.object({ a: z.object({ b: z.number() }).strict(), c: z.string() }).strict(),
    )
    expect(badRequest(() => pipe.transform({ a: { b: 'x' } }))).toEqual({
      statusCode: 400,
      message: [
        'a.b Invalid input: expected number, received string',
        'c Invalid input: expected string, received undefined',
      ],
      error: 'Bad Request',
    })
  })

  it.each([
    [{ a: 1, extra: true }, 'Unrecognized key: "extra"'],
    [[], 'Invalid input: expected object, received array'],
  ])('answers the bare message for the root issue of %j', (body, message) => {
    const pipe = new ZodPipe(z.object({ a: z.number() }).strict())
    expect(badRequest(() => pipe.transform(body))).toEqual({
      statusCode: 400,
      message: [message],
      error: 'Bad Request',
    })
  })

  // Guards pipe order: the global ValidationPipe must not reject a zod-typed body before ZodPipe runs.
  it('is not preempted by the global ValidationPipe on a zod-typed body', async () => {
    // Same options as main.ts; a zod-inferred parameter type emits Object as its design type.
    const globalPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    })
    const body = { anything: true }
    await expect(globalPipe.transform(body, { type: 'body', metatype: Object })).resolves.toBe(body)
  })
})
