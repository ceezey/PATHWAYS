import type {
  RecoveryPointFileMode,
  RecoveryPointKind,
  RecoveryPointListItem,
  RecoveryPointStatus,
} from '@pathways/shared'
import { BACKUP_STALE_AFTER_MS, type RecoveryPointRow } from './recovery-point-capture.service'

/** A stale CREATING row shows as FAILED and a READY row at another migration as INCOMPATIBLE. */
export function toRecoveryPointItem(
  row: RecoveryPointRow,
  currentMigration: string,
  now: Date,
): RecoveryPointListItem {
  const stale =
    row.status === 'CREATING' && now.getTime() - row.startedAt.getTime() > BACKUP_STALE_AFTER_MS
  const status = stale
    ? 'FAILED'
    : row.status === 'READY' && row.migrationName !== currentMigration
      ? 'INCOMPATIBLE'
      : (row.status as RecoveryPointStatus)
  return {
    id: row.id,
    pointType: row.pointType as RecoveryPointKind,
    status,
    fileMode: row.fileMode as RecoveryPointFileMode,
    createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.fullName } : null,
    startedAt: row.startedAt.toISOString(),
    capturedAt: row.capturedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    migrationName: row.migrationName,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    failureReason: stale ? 'The backup did not finish.' : row.failureReason,
  }
}
