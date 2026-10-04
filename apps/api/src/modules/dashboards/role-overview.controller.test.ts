import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { rolePermissions } from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { describe, expect, it, vi } from 'vitest'
import { RoleOverviewController } from './role-overview.controller'
import type { RoleOverviewService } from './role-overview.service'

const identity = {
  userId: '30000000-0000-4000-8000-000000000001',
  roles: ['PROJECT_OFFICER'],
  permissions: [...rolePermissions.PROJECT_OFFICER],
} as unknown as ApplicationIdentity

describe('RoleOverviewController', () => {
  it('requires projects.read and forwards the profile', async () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, RoleOverviewController.prototype.read)).toBe(
      'projects.read',
    )
    const service = { read: vi.fn().mockResolvedValue({}) }
    const controller = new RoleOverviewController(service as unknown as RoleOverviewService)
    await controller.read({ user: identity } as never)
    expect(service.read).toHaveBeenCalledWith(identity)
    expect(() => controller.read({} as never)).toThrow('Application profile is required.')
  })
})
