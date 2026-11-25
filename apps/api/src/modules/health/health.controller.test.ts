import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { HealthController } from './health.controller'
import type { HealthService } from './health.service'

const controller = (ready: boolean) =>
  new HealthController({ isReady: async () => ready } as unknown as HealthService)

describe('HealthController readiness', () => {
  it('is public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.getReadiness)).toBe(true)
  })

  it('is never cached, so a stale ok cannot hide an outage', () => {
    expect(Reflect.getMetadata('__headers__', HealthController.prototype.getReadiness)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ])
  })

  it('answers ok when the database answers', async () => {
    await expect(controller(true).getReadiness()).resolves.toEqual({ status: 'ok' })
  })

  it('answers 503 with only the status when the database does not answer', async () => {
    const error = await controller(false)
      .getReadiness()
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect((error as ServiceUnavailableException).getResponse()).toEqual({ status: 'unavailable' })
  })
})
