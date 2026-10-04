import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { describe, expect, it } from 'vitest'
import { ActivityExtensionsController } from './activity-extensions.controller'

describe('ActivityExtensionsController', () => {
  it.each([
    ['list', 'activities.read'],
    ['request', 'activities.proof.submit'],
    ['verify', 'evidence.review'],
    ['decide', 'activities.update'],
  ] as const)('%s requires %s', (handler, permission) => {
    const method = ActivityExtensionsController.prototype[handler]
    expect(Reflect.getMetadata(PERMISSION_KEY, method)).toBe(permission)
  })
})
