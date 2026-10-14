import 'reflect-metadata'

import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { UsersController } from './users.controller'
import type { UsersService } from './users.service'

const actor = { id: '75000000-0000-4000-8000-000000000001' } as ApplicationIdentity
const users = { list: vi.fn(), authorizeExisting: vi.fn(), update: vi.fn() }
const controller = new UsersController(users as unknown as UsersService)
const anonymous: AuthenticatedRequest = { headers: {} }
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }
const authorize = {
  authUserId: '75000000-0000-4000-8000-000000000002',
  fullName: 'Synthetic User',
  role: 'PROJECT_OFFICER' as const,
  projectIds: [],
}
const change = {
  role: 'PROJECT_OFFICER' as const,
  accountStatus: 'ACTIVE' as const,
  projectIds: [],
}

beforeEach(() => {
  for (const fn of Object.values(users)) fn.mockReset().mockResolvedValue([])
})

describe('users controller application profile', () => {
  it('answers 403 before any service call when the request carries no application profile', () => {
    for (const call of [
      () => controller.list(anonymous),
      () => controller.authorizeExisting(anonymous, authorize),
      () => controller.update(anonymous, 'user-1', change),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    for (const fn of Object.values(users)) expect(fn).not.toHaveBeenCalled()
  })

  it('passes the verified profile to the service', async () => {
    await controller.list(signedIn)
    await controller.authorizeExisting(signedIn, authorize)
    await controller.update(signedIn, 'user-1', change)
    expect(users.list).toHaveBeenCalledWith(actor)
    expect(users.authorizeExisting).toHaveBeenCalledWith(actor, authorize)
    expect(users.update).toHaveBeenCalledWith(actor, 'user-1', change)
  })
})

describe('users controller routes', () => {
  it('registers three routes, each behind the users.authorize permission', () => {
    const prototype = UsersController.prototype as unknown as Record<string, () => void>
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(names.sort()).toEqual(['authorizeExisting', 'list', 'update'])
    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe('users')
    expect(
      names.map((name) => [
        name,
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])],
        Reflect.getMetadata(PATH_METADATA, prototype[name]),
        Reflect.getMetadata(PERMISSION_KEY, prototype[name]),
      ]),
    ).toEqual([
      ['authorizeExisting', 'POST', 'authorize-existing', 'users.authorize'],
      ['list', 'GET', '/', 'users.authorize'],
      ['update', 'PATCH', ':userId', 'users.authorize'],
    ])
  })
})
