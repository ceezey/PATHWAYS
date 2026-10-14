import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { ForbiddenException, type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BeneficiaryStepUpPinService } from './beneficiary-step-up-pin.service'
import { SignInLockoutService } from './signin-lockout.service'
import { WorkspaceResolutionService } from './workspace-resolution.service'

const auth = { id: '72000000-0000-4000-8000-000000000001', aal: 'aal2' }
const profile = { id: auth.id, userId: '72000000-0000-4000-8000-000000000002' }
const sessionId = '72000000-0000-4000-8000-000000000003'
const pinActor = { auth, profile, sessionId }
const signIns = { signIn: vi.fn() }
const pins = { verify: vi.fn(), setup: vi.fn(), change: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: {} },
      { provide: WorkspaceResolutionService, useValue: {} },
      { provide: BeneficiaryStepUpPinService, useValue: pins },
      { provide: SignInLockoutService, useValue: signIns },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the verified values the auth guard attaches; the guard is not under test here.
  app.use((request: Record<string, unknown>, _response: unknown, next: () => void) => {
    Object.assign(request, { auth, user: profile, authSessionId: sessionId })
    next()
  })
  // Same global validation as main.ts, so each route sees the production pipe chain.
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
  base = `http://127.0.0.1:${port}/auth`
})

beforeEach(() => {
  signIns.signIn.mockReset().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' })
  for (const fn of Object.values(pins)) fn.mockReset().mockResolvedValue({ pinState: 'SET' })
})
afterAll(async () => app?.close())

// Posts a raw JSON body and returns the status with the raw response text.
async function post(path: string, body: string) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, text: await response.text() }
}

describe('auth routes body validation', () => {
  it('forwards an address class-validator accepted although zod email would not', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: 'a!b@example.org', password: 'pppp-secret' }),
    )
    expect(result.status).toBe(200)
    expect(signIns.signIn).toHaveBeenCalledWith('a!b@example.org', 'pppp-secret')
  })

  it('answers 400 for an address class-validator refused, before any password grant', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: `${'a'.repeat(65)}@example.org`, password: 'pppp-secret' }),
    )
    expect(result.status).toBe(400)
    expect(JSON.parse(result.text).message).toEqual(['email must be an email'])
    expect(result.text).not.toContain('pppp')
    expect(signIns.signIn).not.toHaveBeenCalled()
  })

  it('answers 400 for an unknown sign-in key', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: 'user@example.org', password: 'pppp-secret', remember: true }),
    )
    expect(result.status).toBe(400)
    expect(signIns.signIn).not.toHaveBeenCalled()
  })

  it.each(['/step-up/pin', '/step-up/pin/setup'])(
    '%s answers 400 for a numeric PIN without echoing it',
    async (path) => {
      const result = await post(path, '{"pin":482915}')
      expect(result.status).toBe(400)
      expect(result.text).not.toContain('482915')
      expect(pins.verify).not.toHaveBeenCalled()
      expect(pins.setup).not.toHaveBeenCalled()
    },
  )

  it('verifies a valid PIN body through the verify route only', async () => {
    const result = await post('/step-up/pin', '{"pin":"482915"}')
    expect(result.status).toBe(200)
    expect(pins.verify).toHaveBeenCalledWith(pinActor, '482915')
    expect(pins.setup).not.toHaveBeenCalled()
  })

  it('sets up a valid PIN body through the setup route only', async () => {
    const result = await post('/step-up/pin/setup', '{"pin":"482915"}')
    expect(result.status).toBe(200)
    expect(pins.setup).toHaveBeenCalledWith(pinActor, '482915')
    expect(pins.verify).not.toHaveBeenCalled()
  })

  it.each([
    '{"newPin":"529317","method":"TOTP"}',
    '{"newPin":"529317","currentPin":482915}',
    `{"newPin":"${'4'.repeat(33)}"}`,
  ])('the PIN change route answers 400 for %s without calling the service', async (body) => {
    const result = await post('/step-up/pin/change', body)
    expect(result.status).toBe(400)
    expect(result.text).not.toContain('482915')
    expect(pins.change).not.toHaveBeenCalled()
  })

  it('keeps an absent current PIN absent, so the service takes the authenticator path', async () => {
    expect((await post('/step-up/pin/change', '{"newPin":"529317"}')).status).toBe(200)
    expect(pins.change).toHaveBeenCalledWith(pinActor, '529317', undefined)
  })

  it('passes a null current PIN to the service, as the former DTO did', async () => {
    const result = await post('/step-up/pin/change', '{"newPin":"529317","currentPin":null}')
    expect(result.status).toBe(200)
    expect(pins.change).toHaveBeenCalledWith(pinActor, '529317', null)
  })
})

describe('auth controller verified values', () => {
  it.each([
    ['no auth', { user: profile, authSessionId: sessionId }],
    ['no profile', { auth, authSessionId: sessionId }],
    ['no session', { auth, user: profile }],
  ])('answers 403 Verified profile required. for a step-up route with %s', (_label, values) => {
    const controller = new AuthController(
      {} as AuthService,
      {} as WorkspaceResolutionService,
      pins as unknown as BeneficiaryStepUpPinService,
      signIns as unknown as SignInLockoutService,
    )
    const request = { headers: {}, ...values } as unknown as AuthenticatedRequest
    for (const call of [
      () => controller.getStepUpStatus(request),
      () => controller.verifyStepUpPin(request, { pin: '482915' }),
      () => controller.setupStepUpPin(request, { pin: '482915' }),
      () => controller.changeStepUpPin(request, { newPin: '529317' }),
      () => controller.unlockStepUpPin(request),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Verified profile required.')
    }
    for (const fn of Object.values(pins)) expect(fn).not.toHaveBeenCalled()
  })
})
