import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '@app/modules/auth/authorization-policy'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import type { ApplicationIdentity, AuthenticatedRequest } from '@app/modules/auth/developer-access'
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routePolicy } from '../../../../web/src/lib/rbac/route-access'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'

vi.mock('@pathways/config', () => ({
  readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }),
}))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(),
}))

const id = '10000000-0000-4000-8000-000000000001'
const projectOfficer: ApplicationIdentity = {
  id,
  aal: 'aal2',
  userId: id,
  organizationId: id,
  fullName: 'Project Officer parity fixture',
  roles: ['PROJECT_OFFICER'],
  permissions: [...rolePermissions.PROJECT_OFFICER],
  assignedProjectIds: [id],
}

const permissionFor = (method: keyof DashboardsController) =>
  Reflect.getMetadata(PERMISSION_KEY, DashboardsController.prototype[method])

describe('dashboard home authorization parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(withAuthorizedOperation).mockImplementation((async (
      _prisma,
      identity,
      permission,
    ) => {
      if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission)) {
        throw new ForbiddenException('Required application permission is missing.')
      }
      return permission
    }) as typeof withAuthorizedOperation)
  })

  it('uses projects.read consistently for the frontend route and both backend guards', async () => {
    expect(routePolicy.dashboard.permissions).toEqual(['projects.read'])
    expect(permissionFor('home')).toBe('projects.read')

    const service = new DashboardsService({} as PrismaService, {} as IndicatorsService)
    await expect(service.home(projectOfficer, {})).resolves.toBe('projects.read')
    expect(withAuthorizedOperation).toHaveBeenCalledWith(
      expect.anything(),
      projectOfficer,
      'projects.read',
      expect.any(Function),
    )

    const home = vi.fn().mockResolvedValue('home')
    const monitoring = vi.fn()
    const controller = new DashboardsController({
      home,
      monitoring,
    } as unknown as DashboardsService)
    await expect(
      controller.home({ user: projectOfficer } as AuthenticatedRequest, {}),
    ).resolves.toBe('home')
    expect(home).toHaveBeenCalledWith(projectOfficer, {})
    expect(monitoring).not.toHaveBeenCalled()
  })

  it('allows a Project Officer without analytics.read and denies a user without projects.read', async () => {
    expect(projectOfficer.permissions).toContain('projects.read')
    expect(projectOfficer.permissions).toContain('analytics.read')

    const service = new DashboardsService({} as PrismaService, {} as IndicatorsService)
    await expect(service.home(projectOfficer, {})).resolves.toBe('projects.read')
    await expect(service.home({ ...projectOfficer, permissions: [] }, {})).rejects.toMatchObject({
      status: 403,
    })
  })

  it('keeps monitoring and SADDD behind analytics.read', async () => {
    expect(permissionFor('monitoring')).toBe('monitoring.read')
    expect(permissionFor('saddd')).toBe('analytics.saddd.read')

    const service = new DashboardsService({} as PrismaService, {} as IndicatorsService)
    await expect(service.monitoring(projectOfficer, {})).rejects.toMatchObject({ status: 403 })
    await expect(service.saddd(projectOfficer, { projectId: id })).resolves.toBe(
      'analytics.saddd.read',
    )
    expect(vi.mocked(withAuthorizedOperation).mock.calls.map((call) => call[2])).toEqual([
      'monitoring.read',
      'analytics.saddd.read',
    ])
  })
})
