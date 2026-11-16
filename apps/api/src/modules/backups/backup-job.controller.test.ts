import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '@app/common/decorators/public.decorator'
import { ForbiddenException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackupJobDatabase } from './backup-job-database'
import { BackupJobController } from './backup-job.controller'
import type { RecoveryPointCaptureService } from './recovery-point-capture.service'

const token = 'e'.repeat(64)
const valid = {
  method: 'POST',
  rawHeaders: ['Authorization', `Bearer ${token}`],
  headers: { authorization: `Bearer ${token}` },
  query: {},
}

function setup(configured = true) {
  vi.stubEnv('BACKUP_JOB_TOKEN', token)
  vi.stubEnv('BACKUP_JOB_DATABASE_URL', 'postgresql://pathways_backup_job@127.0.0.1/local')
  const capture = {
    runDaily: vi.fn().mockResolvedValue({ state: 'COMPLETED', created: 2, failed: 0 }),
  }
  const database = { isConfigured: vi.fn(() => configured) }
  const controller = new BackupJobController(
    capture as unknown as RecoveryPointCaptureService,
    database as unknown as BackupJobDatabase,
  )
  return { capture, controller }
}

afterEach(() => vi.unstubAllEnvs())

describe('BackupJobController', () => {
  it('is public and carries no user permission', () => {
    const handler = BackupJobController.prototype.daily
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true)
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBeUndefined()
  })

  it('runs the daily backup for a valid request', async () => {
    const { capture, controller } = setup()
    await expect(controller.daily(valid)).resolves.toEqual({
      state: 'COMPLETED',
      created: 2,
      failed: 0,
    })
    expect(capture.runDaily).toHaveBeenCalledOnce()
  })

  it('refuses an invalid request without running', async () => {
    const { capture, controller } = setup()
    await expect(controller.daily({ ...valid, method: 'GET' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(capture.runDaily).not.toHaveBeenCalled()
  })

  it('refuses when the job database login is not configured', async () => {
    const { capture, controller } = setup(false)
    await expect(controller.daily(valid)).rejects.toBeInstanceOf(ForbiddenException)
    expect(capture.runDaily).not.toHaveBeenCalled()
  })
})
