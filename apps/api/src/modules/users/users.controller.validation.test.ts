import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { UsersController } from './users.controller'
import { UsersService } from './users.service'

const authUserId = '71000000-0000-4000-8000-000000000001'
const userId = '71000000-0000-4000-8000-000000000002'
const actor = { id: '71000000-0000-4000-8000-000000000003', aal: 'aal2' }
const users = { list: vi.fn(), authorizeExisting: vi.fn(), update: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [{ provide: UsersService, useValue: users }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
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
  base = `http://127.0.0.1:${port}/users`
})

beforeEach(() => {
  users.authorizeExisting.mockReset().mockResolvedValue({ id: userId })
  users.update.mockReset().mockResolvedValue({ id: userId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', path: string, body: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('users routes body validation', () => {
  it('forwards a trimmed authorization body with the default project list', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({ authUserId, fullName: '  Synthetic User  ', role: 'PROJECT_OFFICER' }),
    )
    expect(result.status).toBe(201)
    expect(users.authorizeExisting).toHaveBeenCalledWith(actor, {
      authUserId,
      fullName: 'Synthetic User',
      role: 'PROJECT_OFFICER',
      projectIds: [],
    })
  })

  it('answers the class-validator UUID message for an id the editor accepts', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({
        authUserId: '71000000-0000-0000-8000-000000000001',
        fullName: 'Synthetic User',
        role: 'PROJECT_OFFICER',
      }),
    )
    expect(result).toEqual({
      status: 400,
      body: { statusCode: 400, error: 'Bad Request', message: ['authUserId must be a UUID'] },
    })
    expect(users.authorizeExisting).not.toHaveBeenCalled()
  })

  it('answers the class-validator wording for a project list over 100', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({
        authUserId,
        fullName: 'Synthetic User',
        role: 'PROJECT_OFFICER',
        projectIds: Array(101).fill(authUserId),
      }),
    )
    expect(result).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds must contain no more than 100 elements'],
      },
    })
    expect(users.authorizeExisting).not.toHaveBeenCalled()
  })

  it('forwards an update with a null name', async () => {
    const body = {
      fullName: null,
      role: 'PROGRAM_MANAGER',
      accountStatus: 'ACTIVE',
      projectIds: [],
    }
    const result = await send('PATCH', `/${userId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(users.update).toHaveBeenCalledWith(actor, userId, body)
  })

  it('passes the user id from the path of the update route', async () => {
    const body = { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE', projectIds: [] }
    expect((await send('PATCH', `/${authUserId}`, JSON.stringify(body))).status).toBe(200)
    expect(users.update).toHaveBeenCalledWith(actor, authUserId, body)
  })

  it.each([
    [
      'POST',
      '/authorize-existing',
      { authUserId, fullName: 'A', role: 'PROJECT_OFFICER', organizationId: authUserId },
    ],
    [
      'PATCH',
      `/${userId}`,
      { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE', projectIds: [], permissions: [] },
    ],
  ] as const)(
    '%s %s answers 400 for an unknown key without calling the service',
    async (method, path, body) => {
      expect((await send(method, path, JSON.stringify(body))).status).toBe(400)
      expect(users.authorizeExisting).not.toHaveBeenCalled()
      expect(users.update).not.toHaveBeenCalled()
    },
  )
})
