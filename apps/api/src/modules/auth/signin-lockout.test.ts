import 'reflect-metadata'
import { BadRequestException, HttpException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { SignInDto } from './signin-lockout.dto'
import { type PasswordGrant, SignInLockoutService } from './signin-lockout.service'

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: SignInDto })

// In-memory model of the 0046 functions: 5 failures lock, success resets.
function harness(grants: PasswordGrant[]) {
  const failures = new Map<string, number>()
  const locked = new Set<string>()
  const calls: string[] = []
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray, email: string) => {
      const sql = strings.join('?')
      calls.push(sql)
      if (sql.includes('remaining')) return [{ s: locked.has(email) ? 900 : 0 }]
      if (sql.includes('failure')) {
        const n = (failures.get(email) ?? 0) + 1
        failures.set(email, n)
        if (n >= 5) locked.add(email)
        return [{ s: n >= 5 ? 900 : 0 }]
      }
      failures.delete(email)
      return [{ s: null }]
    },
  }
  const service = new SignInLockoutService(prisma as unknown as PrismaService)
  const queue = [...grants]
  const grantCalls: string[] = []
  service.grant = async (email) => {
    grantCalls.push(email)
    return queue.shift() ?? { session: null, rejected: true }
  }
  return { service, failures, locked, calls, grantCalls }
}

const ok: PasswordGrant = { session: { accessToken: 'a', refreshToken: 'r' }, rejected: false }
const bad: PasswordGrant = { session: null, rejected: true }
const status = async (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (error: unknown) => (error instanceof HttpException ? error.getStatus() : -1),
  )

describe('sign-in lockout (G-F1-10)', () => {
  it('happy: a correct password returns the session and clears prior failures', async () => {
    const h = harness([bad, bad, ok])
    await status(h.service.signIn('A@x.org', 'wrong'))
    await status(h.service.signIn('a@x.org', 'wrong'))
    await expect(h.service.signIn(' a@x.org ', 'right')).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    })
    expect(h.failures.size).toBe(0)
  })

  it('sad: failures return 401 until the fifth locks with 429', async () => {
    const h = harness([])
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push(await status(h.service.signIn('a@x.org', 'wrong')))
    expect(codes).toEqual([401, 401, 401, 401, 429])
  })

  it('abuse: a locked identifier is refused without trying the password, even a correct one', async () => {
    const h = harness([])
    for (let i = 0; i < 5; i++) await status(h.service.signIn('a@x.org', 'wrong'))
    h.grantCalls.length = 0
    expect(await status(h.service.signIn('a@x.org', 'right-now'))).toBe(429)
    expect(h.grantCalls).toEqual([])
  })

  it('abuse: unknown and known identifiers get identical responses', async () => {
    const h = harness([])
    const outcome = async (email: string) => {
      const seen: Array<[number, unknown]> = []
      for (let i = 0; i < 5; i++) {
        const error = await h.service.signIn(email, 'x').catch((e: HttpException) => e)
        seen.push([(error as HttpException).getStatus(), (error as HttpException).getResponse()])
      }
      return seen
    }
    expect(await outcome('known@x.org')).toEqual(await outcome('nobody@x.org'))
  })

  it('abuse: an identity-provider outage is 503 and is not counted as a failure', async () => {
    const h = harness([{ session: null, rejected: false }])
    expect(await status(h.service.signIn('a@x.org', 'x'))).toBe(503)
    expect(h.failures.size).toBe(0)
  })

  it('abuse: a database error is a fixed 503 that does not echo the email', async () => {
    const service = new SignInLockoutService({
      $queryRaw: async () => {
        throw new Error('secret@x.org leaked')
      },
    } as unknown as PrismaService)
    const error = await service.signIn('secret@x.org', 'p').catch((e: unknown) => e)
    expect((error as HttpException).getStatus()).toBe(503)
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('secret@x.org')
  })
})

describe('sign-in body', () => {
  it('accepts an email and password only', async () => {
    await expect(validate({ email: 'a@x.org', password: 'pw' })).resolves.toEqual({
      email: 'a@x.org',
      password: 'pw',
    })
  })

  it.each([
    { email: 'not-an-email', password: 'pw' },
    { email: 'a@x.org', password: '' },
    { email: 'a@x.org', password: 'p'.repeat(1025) },
    { email: 'a@x.org', password: 'pw', organizationId: 'x' },
    { email: 'a@x.org', password: 123 },
  ])('rejects a malformed body without echoing the password', async (body) => {
    const error = await Promise.resolve(validate(body)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BadRequestException)
    expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain('pppp')
  })
})
