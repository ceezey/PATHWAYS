import { describe, expect, it } from 'vitest'
import {
  backupErrorCodes,
  downloadRecoveryPointRequest,
  recoveryPointListItem,
  recoveryPointProblemMessages,
  recoveryPointProblems,
  recoveryPointStatuses,
  restoreRecoveryPointRequest,
} from './recovery-points'

const item = {
  id: 'b1000000-0000-4000-8000-000000000001',
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdBy: { id: 'b1000000-0000-4000-8000-000000000002', name: 'Synthetic admin' },
  startedAt: '2026-11-12T01:00:00.000Z',
  capturedAt: '2026-11-12T01:00:01.000Z',
  completedAt: '2026-11-12T01:00:03.000Z',
  migrationName: '0091_backup_recovery',
  sizeBytes: 2048,
  failureReason: null,
}

describe('recovery point contracts', () => {
  it('accepts a ready manual point and an automatic point with no creator', () => {
    expect(recoveryPointListItem.safeParse(item).success).toBe(true)
    expect(
      recoveryPointListItem.safeParse({ ...item, pointType: 'AUTOMATIC', createdBy: null }).success,
    ).toBe(true)
  })

  it.each([
    ['an unknown status', { status: 'DELETED' }],
    ['an unknown kind', { pointType: 'DAILY' }],
    ['a negative size', { sizeBytes: -1 }],
    ['an extra key', { path: 'organizations/x' }],
  ])('rejects %s', (_label, patch) => {
    expect(recoveryPointListItem.safeParse({ ...item, ...patch }).success).toBe(false)
  })

  it('trims the typed organization code and rejects blank or extra keys', () => {
    expect(restoreRecoveryPointRequest.parse({ organizationCode: ' DEMO-ORG ' })).toEqual({
      organizationCode: 'DEMO-ORG',
    })
    expect(restoreRecoveryPointRequest.safeParse({ organizationCode: '   ' }).success).toBe(false)
    expect(
      restoreRecoveryPointRequest.safeParse({ organizationCode: 'X', confirm: true }).success,
    ).toBe(false)
  })

  it('accepts a passphrase of 12 to 128 characters untrimmed and rejects others', () => {
    for (const length of [12, 128])
      expect(
        downloadRecoveryPointRequest.safeParse({ passphrase: 'a'.repeat(length) }).success,
      ).toBe(true)
    for (const length of [11, 129])
      expect(
        downloadRecoveryPointRequest.safeParse({ passphrase: 'a'.repeat(length) }).success,
      ).toBe(false)
    expect(downloadRecoveryPointRequest.parse({ passphrase: '  elevenchars  ' })).toEqual({
      passphrase: '  elevenchars  ',
    })
    expect(
      downloadRecoveryPointRequest.safeParse({ passphrase: 'a'.repeat(12), extra: 1 }).success,
    ).toBe(false)
  })

  it('lists INCOMPATIBLE as a status but not as a stored problem code', () => {
    expect(recoveryPointStatuses).toContain('INCOMPATIBLE')
    expect(backupErrorCodes).toEqual(
      expect.arrayContaining([
        ...recoveryPointProblems,
        'BUSY',
        'STORAGE_UNAVAILABLE',
        'DATABASE_BUSY',
        'STEP_UP_TOTP_REQUIRED',
      ]),
    )
  })

  it('has one message per problem', () => {
    expect(Object.keys(recoveryPointProblemMessages).sort()).toEqual(
      [...recoveryPointProblems].sort(),
    )
  })
})
