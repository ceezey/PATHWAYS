import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

const actor = { id: '76000000-0000-4000-8000-000000000001', aal: 'aal2' }
const updatedAt = '2026-10-01T00:00:00.000Z'
const profiles = { read: vi.fn(), update: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProfileController],
    providers: [{ provide: ProfileService, useValue: profiles }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so the route sees the production pipe chain.
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
  url = `http://127.0.0.1:${port}/profile`
})

beforeEach(() =>
  profiles.update
    .mockReset()
    .mockResolvedValue({ fullName: 'Synthetic User', contactNumber: null, updatedAt }),
)
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status.
async function patch(body: unknown) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.status
}

describe('PATCH profile body validation', () => {
  it('forwards the trimmed body', async () => {
    expect(
      await patch({
        fullName: '  Synthetic User  ',
        contactNumber: ' ',
        expectedUpdatedAt: updatedAt,
      }),
    ).toBe(200)
    expect(profiles.update).toHaveBeenCalledWith(actor, {
      fullName: 'Synthetic User',
      contactNumber: '',
      expectedUpdatedAt: updatedAt,
    })
  })

  it('forwards a date-only expectedUpdatedAt, which the strict ISO 8601 rule accepts', async () => {
    expect(
      await patch({
        fullName: 'Synthetic User',
        contactNumber: '',
        expectedUpdatedAt: '2026-10-01',
      }),
    ).toBe(200)
    expect(profiles.update).toHaveBeenCalledTimes(1)
  })

  it.each([
    { fullName: 'Synthetic User', contactNumber: '', expectedUpdatedAt: 'yesterday' },
    {
      fullName: 'Synthetic User',
      contactNumber: '',
      expectedUpdatedAt: updatedAt,
      email: 'a@example.invalid',
    },
  ])('answers 400 for %j without calling the service', async (body) => {
    expect(await patch(body)).toBe(400)
    expect(profiles.update).not.toHaveBeenCalled()
  })
})
