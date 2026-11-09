import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { mapPinPlaceQuery, saveMapPinRequest } from '@pathways/shared'
import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProjectMapPinsController } from './project-map-pins.controller'
import type { ProjectMapPinsService } from './project-map-pins.service'

const projectId = '51000000-0000-4000-8000-000000000004'
const identity: ApplicationIdentity = {
  id: '51000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  userId: '51000000-0000-4000-8000-000000000002',
  organizationId: '51000000-0000-4000-8000-000000000003',
  fullName: 'Synthetic manager',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read', 'projects.update'],
  assignedProjectIds: [projectId],
}
const request = { user: identity } as AuthenticatedRequest
const body = {
  name: 'Catarman',
  province: 'Northern Samar',
  longitude: 124.7,
  latitude: 12.6,
  locked: false,
}
const handlers = [ProjectMapPinsController.prototype.save, ProjectMapPinsController.prototype.reset]

describe('ProjectMapPinsController', () => {
  it('passes the identity, project and parsed input to the service', async () => {
    const service = { save: vi.fn().mockResolvedValue(undefined), reset: vi.fn() }
    const controller = new ProjectMapPinsController(service as unknown as ProjectMapPinsService)
    await controller.save(request, projectId, body)
    expect(service.save).toHaveBeenCalledWith(identity, projectId, body)
    const place = { name: 'Catarman', province: 'Northern Samar' }
    await controller.reset(request, projectId, place)
    expect(service.reset).toHaveBeenCalledWith(identity, projectId, place)
  })

  it.each([{ longitude: 130 }, { longitude: 100 }, { latitude: 30 }, { latitude: 1 }])(
    'answers 400 from the zod pipe for %o',
    (bad) => {
      expect(() => new ZodPipe(saveMapPinRequest).transform({ ...body, ...bad })).toThrow(
        BadRequestException,
      )
    },
  )

  it('answers 400 for a reset query missing the province', () => {
    expect(() => new ZodPipe(mapPinPlaceQuery).transform({ name: 'Catarman' })).toThrow(
      BadRequestException,
    )
  })

  it('requires projects.update on both writes', () => {
    for (const handler of handlers)
      expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('projects.update')
  })

  it('answers 204 with a no-store cache header on both writes', () => {
    for (const handler of handlers) {
      expect(Reflect.getMetadata('__httpCode__', handler)).toBe(204)
      expect(Reflect.getMetadata('__headers__', handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'private, no-store',
      })
    }
  })
})
