import { z } from 'zod'

import { trimmedInput, uuidString } from '../common/field-schemas'

// Request and response shapes of the backup routes (cr-pathways-backup-recovery).

export const recoveryPointStatuses = [
  'READY',
  'CREATING',
  'FAILED',
  'UNAVAILABLE',
  'INCOMPATIBLE',
] as const
export type RecoveryPointStatus = (typeof recoveryPointStatuses)[number]
export const recoveryPointKinds = ['MANUAL', 'AUTOMATIC', 'PRE_RESTORE'] as const
export type RecoveryPointKind = (typeof recoveryPointKinds)[number]
export const recoveryPointFileModes = ['manifest', 'copy'] as const
export type RecoveryPointFileMode = (typeof recoveryPointFileModes)[number]

/** The E3 checks that make a recovery point unusable for a restore. */
export const recoveryPointProblems = [
  'NOT_READY',
  'DATA_FILE_MISSING',
  'CHECKSUM_MISMATCH',
  'OTHER_ORGANIZATION',
  'MIGRATION_MISMATCH',
  'FILE_MISSING',
  'FILE_CHANGED',
] as const
export type RecoveryPointProblem = (typeof recoveryPointProblems)[number]

export const recoveryPointProblemMessages: Record<RecoveryPointProblem, string> = {
  NOT_READY: 'This recovery point is not ready.',
  DATA_FILE_MISSING: "This recovery point's data file is missing.",
  CHECKSUM_MISMATCH: "This recovery point's data file has changed and cannot be trusted.",
  OTHER_ORGANIZATION: 'This recovery point belongs to another organization.',
  MIGRATION_MISMATCH:
    'This recovery point was made with an older version of PATHWAYS and cannot be restored.',
  FILE_MISSING: 'A file this recovery point needs is missing.',
  FILE_CHANGED: 'A file this recovery point needs has changed.',
}

/** The `code` of every `{ message, code }` error body the backup routes return. */
export const backupErrorCodes = [
  ...recoveryPointProblems,
  'NOT_FOUND',
  'CODE_MISMATCH',
  'BUSY',
  'STORAGE_UNAVAILABLE',
  'CREATE_FAILED',
  'PRE_RESTORE_FAILED',
  'FILE_RESTORE_FAILED',
  'INCOMPATIBLE',
  'COUNT_MISMATCH',
  'RESTORE_FAILED',
  'DATABASE_BUSY',
] as const
export type BackupErrorCode = (typeof backupErrorCodes)[number]

const instant = z.string().datetime()

export const recoveryPointListItem = z
  .object({
    id: uuidString,
    pointType: z.enum(recoveryPointKinds),
    status: z.enum(recoveryPointStatuses),
    fileMode: z.enum(recoveryPointFileModes),
    createdBy: z
      .object({ id: uuidString, name: z.string().max(200) })
      .strict()
      .nullable(),
    startedAt: instant,
    capturedAt: instant.nullable(),
    completedAt: instant.nullable(),
    migrationName: z.string().max(255).nullable(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    failureReason: z.string().max(500).nullable(),
  })
  .strict()
export type RecoveryPointListItem = z.infer<typeof recoveryPointListItem>

export const recoveryPointList = z
  .object({
    points: z.array(recoveryPointListItem),
    currentMigration: z.string().max(255),
    fileMode: z.enum(recoveryPointFileModes),
    organizationCode: z.string().min(1).max(120),
  })
  .strict()
export type RecoveryPointList = z.infer<typeof recoveryPointList>

export const recoveryPointVerifyResult = z
  .object({ point: recoveryPointListItem, problem: z.enum(recoveryPointProblems).nullable() })
  .strict()
export type RecoveryPointVerifyResult = z.infer<typeof recoveryPointVerifyResult>

export const restoreRecoveryPointRequest = z
  .object({ organizationCode: trimmedInput(z.string().min(1).max(120)) })
  .strict()
export type RestoreRecoveryPointRequest = z.infer<typeof restoreRecoveryPointRequest>

export const restoreRecoveryPointResult = z
  .object({
    point: recoveryPointListItem,
    preRestorePointId: uuidString,
    rowCounts: z.record(z.string(), z.number().int().nonnegative()),
    filesRestored: z.number().int().nonnegative(),
  })
  .strict()
export type RestoreRecoveryPointResult = z.infer<typeof restoreRecoveryPointResult>

// Not trimmed: the passphrase is used exactly as typed.
export const downloadRecoveryPointRequest = z
  .object({ passphrase: z.string().min(12).max(128) })
  .strict()
export type DownloadRecoveryPointRequest = z.infer<typeof downloadRecoveryPointRequest>

export const recoveryPointDownload = z
  .object({ dataUrl: z.string().url(), manifestUrl: z.string().url(), expiresAt: instant })
  .strict()
export type RecoveryPointDownload = z.infer<typeof recoveryPointDownload>
