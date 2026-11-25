import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { TOTP_STEP_UP_KEY } from '@app/common/decorators/totp-step-up.decorator'
import { ZodPipe } from '@app/common/validation/zod-pipe'
import { BadRequestException } from '@nestjs/common'
import { restoreRecoveryPointRequest } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { AppModule } from '../../app.module'
import { BackupsController } from './backups.controller'
import { BackupsModule } from './backups.module'

describe('BackupsController', () => {
  it.each([
    ['list', ['backups.create', 'backups.restore']],
    ['create', 'backups.create'],
    ['verify', ['backups.create', 'backups.restore']],
    ['download', ['backups.create', 'backups.restore']],
    ['restore', 'backups.restore'],
  ] as const)('%s requires %j', (handler, permission) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, BackupsController.prototype[handler])).toEqual(
      permission,
    )
  })

  it.each([
    ['list', undefined],
    ['create', undefined],
    ['verify', undefined],
    ['download', true],
    ['restore', true],
  ] as const)('%s authenticator step-up is %s', (handler, required) => {
    expect(Reflect.getMetadata(TOTP_STEP_UP_KEY, BackupsController.prototype[handler])).toBe(
      required,
    )
  })

  it('rejects a restore body without the organization code', () => {
    expect(() => new ZodPipe(restoreRecoveryPointRequest).transform({})).toThrow(
      BadRequestException,
    )
  })

  it('is registered in the application module', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(BackupsModule)
  })
})
