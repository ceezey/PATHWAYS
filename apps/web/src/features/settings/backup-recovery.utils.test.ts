import { PathwaysClientError } from '@/lib/api/core/request'
import type { RecoveryPointListItem } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  backupFailureMessage,
  canCheckPoint,
  canRestorePoint,
  formatRecoveryPointTime,
  recoveryPointCreator,
} from './backup-recovery.utils'

const point: RecoveryPointListItem = {
  id: '79200000-0000-4000-8000-000000000001',
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdBy: { id: '79200000-0000-4000-8000-000000000002', name: 'Synthetic Admin' },
  startedAt: '2026-11-12T05:59:59.000Z',
  capturedAt: '2026-11-12T06:00:00.000Z',
  completedAt: '2026-11-12T06:00:09.000Z',
  migrationName: '0091_backup_recovery',
  sizeBytes: 1048576,
  failureReason: null,
}
const generic = 'The requested operation could not be completed.'

describe('backup recovery utils', () => {
  it('restores only READY points and checks READY, INCOMPATIBLE and UNAVAILABLE ones', () => {
    expect(canRestorePoint({ ...point, status: 'READY' })).toBe(true)
    for (const status of ['UNAVAILABLE', 'INCOMPATIBLE', 'CREATING', 'FAILED'] as const)
      expect(canRestorePoint({ ...point, status })).toBe(false)
    for (const status of ['READY', 'INCOMPATIBLE', 'UNAVAILABLE'] as const)
      expect(canCheckPoint({ ...point, status })).toBe(true)
    for (const status of ['FAILED', 'CREATING'] as const)
      expect(canCheckPoint({ ...point, status })).toBe(false)
  })

  it('formats the captured time in Manila and names the system for automatic points', () => {
    expect(formatRecoveryPointTime({ ...point, capturedAt: '2026-11-12T06:00:00.000Z' })).toMatch(
      /Nov 12, 2026, 2:00\sPM/,
    )
    expect(
      formatRecoveryPointTime({
        ...point,
        capturedAt: null,
        startedAt: '2026-11-12T06:00:00.000Z',
      }),
    ).toMatch(/2:00\sPM/)
    expect(recoveryPointCreator({ ...point, pointType: 'AUTOMATIC', createdBy: null })).toBe(
      'System',
    )
    expect(recoveryPointCreator(point)).toBe('Synthetic Admin')
  })

  it('keeps server refusals and names the outcome of each failed action', () => {
    const server = new PathwaysClientError(
      'Backup storage is unavailable. Try again later.',
      'network',
      [],
      503,
    )
    expect(backupFailureMessage('create', server)).toBe(
      'Backup storage is unavailable. Try again later.',
    )
    expect(
      backupFailureMessage('create', new PathwaysClientError(generic, 'network', [], 500)),
    ).toBe('The backup could not be created. The failure is recorded in the audit log.')
    expect(
      backupFailureMessage('create', new PathwaysClientError(generic, 'network', [], 503)),
    ).toBe('The backup could not be created. The failure is recorded in the audit log.')
    expect(
      backupFailureMessage('restore', new PathwaysClientError(generic, 'network', [], 500)),
    ).toBe(
      'The restore failed and your data was not changed. The failure is recorded in the audit log.',
    )
    expect(
      backupFailureMessage('restore', new PathwaysClientError(generic, 'network', [], 504)),
    ).toMatch(/could not be confirmed/)
    expect(backupFailureMessage('restore', new TypeError('fetch failed'))).toMatch(
      /could not be confirmed/,
    )
    expect(backupFailureMessage('verify', new PathwaysClientError('x', 'not_found', [], 404))).toBe(
      'This recovery point no longer exists. Refresh the list.',
    )
    expect(backupFailureMessage('verify', new TypeError('x'))).toBe(
      'The recovery point could not be checked.',
    )
    expect(backupFailureMessage('download', new TypeError('x'))).toBe(
      'The download links could not be made.',
    )
  })
})
