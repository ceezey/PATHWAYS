import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { describe, expect, it } from 'vitest'
import { ActivityEscalationsController } from './activity-escalations.controller'

describe('ActivityEscalationsController', () => {
  it.each([
    ['list', 'activities.escalations.read'],
    ['raise', 'activities.escalations.raise'],
    ['forward', 'activities.update'],
    ['resolve', 'activities.update'],
    ['programResolve', 'activities.escalations.read'],
  ] as const)('%s requires %s', (handler, permission) => {
    const method = ActivityEscalationsController.prototype[handler]
    expect(Reflect.getMetadata(PERMISSION_KEY, method)).toBe(permission)
  })
})
