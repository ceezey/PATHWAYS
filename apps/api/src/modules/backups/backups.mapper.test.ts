import { recoveryPointListItem } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { toRecoveryPointItem } from './backups.mapper'
import type { RecoveryPointRow } from './recovery-point-capture.service'

const now = new Date('2026-11-15T02:00:00.000Z')
const row = (patch: Partial<RecoveryPointRow> = {}): RecoveryPointRow => ({
  id: 'b1400000-0000-4000-8000-000000000001',
  organizationId: 'b1400000-0000-4000-8000-00000000000a',
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdById: 'b1400000-0000-4000-8000-000000000002',
  createdBy: { id: 'b1400000-0000-4000-8000-000000000002', fullName: 'Synthetic admin' },
  startedAt: new Date('2026-11-15T01:00:00.000Z'),
  capturedAt: new Date('2026-11-15T01:00:01.000Z'),
  completedAt: new Date('2026-11-15T01:00:03.000Z'),
  migrationName: '0091_backup_recovery',
  sizeBytes: 2048n,
  manifestSha256: 'a'.repeat(64),
  failureReason: null,
  ...patch,
})

describe('toRecoveryPointItem', () => {
  it('maps a ready point with its creator, ISO dates and a numeric size', () => {
    const item = toRecoveryPointItem(row(), '0091_backup_recovery', now)
    expect(recoveryPointListItem.parse(item)).toEqual(item)
    expect(item).toMatchObject({
      status: 'READY',
      sizeBytes: 2048,
      createdBy: { id: 'b1400000-0000-4000-8000-000000000002', name: 'Synthetic admin' },
      startedAt: '2026-11-15T01:00:00.000Z',
    })
  })

  it('shows a CREATING point older than 10 minutes as FAILED', () => {
    const item = toRecoveryPointItem(
      row({ status: 'CREATING', capturedAt: null, completedAt: null, sizeBytes: null }),
      '0091_backup_recovery',
      now,
    )
    expect(item).toMatchObject({ status: 'FAILED', failureReason: 'The backup did not finish.' })
    expect(
      toRecoveryPointItem(
        row({ status: 'CREATING', startedAt: new Date('2026-11-15T01:55:00.000Z') }),
        '0091_backup_recovery',
        now,
      ).status,
    ).toBe('CREATING')
  })

  it('shows a READY point at another migration as INCOMPATIBLE', () => {
    const item = toRecoveryPointItem(row({ migrationName: '0090_x' }), '0091_backup_recovery', now)
    expect(item.status).toBe('INCOMPATIBLE')
    expect(recoveryPointListItem.safeParse(item).success).toBe(true)
  })

  it('maps an automatic point with no creator', () => {
    const item = toRecoveryPointItem(
      row({ pointType: 'AUTOMATIC', createdById: null, createdBy: null }),
      '0091_backup_recovery',
      now,
    )
    expect(item.createdBy).toBeNull()
  })
})
