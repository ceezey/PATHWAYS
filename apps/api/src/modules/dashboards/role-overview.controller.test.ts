import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import type { PrismaService } from '@app/prisma/prisma.service'
import { Logger } from '@nestjs/common'
import { rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardViewsService } from './dashboard-views.service'
import { RoleOverviewController } from './role-overview.controller'
import type { RoleOverviewService } from './role-overview.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const identity = {
  id: '30000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  userId: '30000000-0000-4000-8000-000000000001',
  roles: ['PROJECT_OFFICER'],
  permissions: [...rolePermissions.PROJECT_OFFICER],
} as unknown as ApplicationIdentity

function build(read: ReturnType<typeof vi.fn>, views: Pick<DashboardViewsService, 'record'>) {
  const service = { read }
  return new RoleOverviewController(
    service as unknown as RoleOverviewService,
    views as DashboardViewsService,
  )
}

describe('RoleOverviewController', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires projects.read and forwards the profile', async () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, RoleOverviewController.prototype.read)).toBe(
      'projects.read',
    )
    const read = vi.fn().mockResolvedValue({ marker: 'overview' })
    const views = { record: vi.fn().mockResolvedValue(undefined) }
    const controller = build(read, views)
    await expect(controller.read({ user: identity } as never)).resolves.toEqual({
      marker: 'overview',
    })
    expect(read).toHaveBeenCalledWith(identity)
    expect(views.record).toHaveBeenCalledWith(identity, 'home')
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(views.record.mock.invocationCallOrder[0])
    expect(() => controller.read({} as never)).toThrow('Application profile is required.')
  })

  it('does not record a view when the dashboard read fails', async () => {
    const read = vi.fn().mockRejectedValue(new Error('read failed'))
    const views = { record: vi.fn() }
    await expect(build(read, views).read({ user: identity } as never)).rejects.toThrow(
      'read failed',
    )
    expect(views.record).not.toHaveBeenCalled()
  })

  it('still returns the dashboard when recording fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.mocked(withAuthorizedOperation).mockRejectedValue(new Error('audit down'))
    const views = new DashboardViewsService({} as PrismaService)
    const read = vi.fn().mockResolvedValue({ marker: 'overview' })
    await expect(build(read, views).read({ user: identity } as never)).resolves.toEqual({
      marker: 'overview',
    })
    expect(warn).toHaveBeenCalledWith({ event: 'PATHWAYS_DASHBOARD_AUDIT_UNAVAILABLE' })
  })
})
