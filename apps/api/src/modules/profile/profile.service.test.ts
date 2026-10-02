import 'reflect-metadata'
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { UpdateOwnProfileDto } from './profile.dto'
import { ProfileService } from './profile.service'

const state = vi.hoisted(() => ({ tx: {} as Record<string, unknown>, permission: '' }))

// The verified-transaction wrapper is replaced so the service runs against a mocked tx.
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: (
    _prisma: unknown,
    identity: ApplicationIdentity,
    permission: string,
    run: (tx: unknown, actor: ApplicationIdentity) => unknown,
  ) => {
    state.permission = permission
    return run(state.tx, identity)
  },
}))

const actor = {
  id: '76000000-0000-4000-8000-000000000001',
  userId: '76000000-0000-4000-8000-000000000002',
  organizationId: '76000000-0000-4000-8000-000000000003',
} as unknown as ApplicationIdentity
const updatedAt = new Date('2026-10-01T00:00:00.000Z')
const row = { fullName: 'Synthetic User', contactNumber: null, updatedAt }
const service = new ProfileService({} as PrismaService)

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const validate = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: UpdateOwnProfileDto })
const body = {
  fullName: 'Synthetic User',
  contactNumber: '+63 900 000 0000',
  expectedUpdatedAt: updatedAt.toISOString(),
}

describe('own profile (G-F1-8)', () => {
  it('read: selects only the verified caller row, in the caller organization', async () => {
    const findFirst = vi.fn().mockResolvedValue(row)
    state.tx = { systemUser: { findFirst } }
    await expect(service.read(actor)).resolves.toEqual({
      fullName: 'Synthetic User',
      contactNumber: null,
      updatedAt: updatedAt.toISOString(),
    })
    expect(state.permission).toBe('profile.manage')
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: actor.userId,
      organizationId: actor.organizationId,
      authUserId: actor.id,
      accountStatus: 'ACTIVE',
      archivedAt: null,
    })
    expect(findFirst.mock.calls[0][0].select).toEqual({
      fullName: true,
      contactNumber: true,
      updatedAt: true,
    })
  })

  it('update: sends only the three allowed inputs and returns the serialized own row', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([row])
    state.tx = { $queryRaw }
    const input = await validate(body)
    await expect(service.update(actor, input as UpdateOwnProfileDto)).resolves.toMatchObject({
      fullName: 'Synthetic User',
    })
    const values = $queryRaw.mock.calls[0].slice(1)
    expect(values).toEqual(['Synthetic User', '+63 900 000 0000', updatedAt])
    expect(JSON.stringify($queryRaw.mock.calls[0])).not.toContain(actor.userId)
  })

  it('update: a stale expectedUpdatedAt that matches no row is a conflict', async () => {
    state.tx = { $queryRaw: vi.fn().mockResolvedValue([]) }
    await expect(service.update(actor, body)).rejects.toBeInstanceOf(ConflictException)
  })

  it.each([
    { ...body, userId: 'x' },
    { ...body, organizationId: 'x' },
    { ...body, roleId: 'x' },
    { ...body, accountStatus: 'ACTIVE' },
    { ...body, email: 'a@example.invalid' },
    { ...body, fullName: 'x' },
    { ...body, contactNumber: 'not a phone' },
    { ...body, expectedUpdatedAt: 'yesterday' },
    { fullName: 'Synthetic User', contactNumber: '' },
  ])('update: rejects a forbidden or malformed body (%o)', async (input) => {
    const error = await Promise.resolve(validate(input)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BadRequestException)
  })

  it('update: trims names and accepts an empty contact number', async () => {
    await expect(
      validate({ ...body, fullName: '  Synthetic User  ', contactNumber: '' }),
    ).resolves.toMatchObject({ fullName: 'Synthetic User', contactNumber: '' })
  })
})
