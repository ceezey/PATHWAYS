import { gzipSync } from 'node:zlib'
import { writeAuditLog } from '@app/common/audit/write-audit-log'
import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { PrismaService } from '@app/prisma/prisma.service'
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Prisma } from '@prisma/client'
import { faultCause, prismaSqlState } from '../../prisma/transaction-diagnostic'
import { BackupJobDatabase } from './backup-job-database'
import {
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  BackupStorage,
  BackupStorageUnavailableError,
  pointCopyPath,
  pointPrefix,
} from './backup-storage'
import {
  RECOVERY_POINT_MANIFEST_FORMAT,
  type RecoveryPointManifest,
  sha256Hex,
} from './recovery-point-manifest'

export const BACKUP_TRANSACTION_TIMEOUT_MS = 120_000
export const BACKUP_STATEMENT_TIMEOUT_MS = '110000'
export const BACKUP_STALE_AFTER_MS = 600_000
// AUTOMATIC must equal the 7 in pathways.p91_job_retention_points.
export const BACKUP_RETENTION = { AUTOMATIC: 7, PRE_RESTORE: 3, MANUAL: 10 } as const
// A pre-restore point is the undo of a restore, so it is kept at least this long even beyond the 3 newest.
export const PRE_RESTORE_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const BACKUP_MESSAGES = {
  STORAGE_UNAVAILABLE: 'Backup storage is unavailable. Try again later.',
  BUSY: 'A backup or restore is already running. Try again in a few minutes.',
  CREATE_FAILED: 'The backup could not be created. The failure was recorded.',
} as const

const createdBy = { createdBy: { select: { id: true, fullName: true } } } as const
export type RecoveryPointRow = Prisma.RecoveryPointGetPayload<{ include: typeof createdBy }>
type PointType = 'MANUAL' | 'PRE_RESTORE' | 'AUTOMATIC'
type CapturedSnapshot = {
  data: string
  rowCounts: Record<string, number>
  migration: string
  capturedAt: string
}
type CaptureOutcome = {
  capturedAt: string
  migration: string
  sizeBytes: number
  manifestSha256: string
  changes: Record<string, unknown>
}
type FailureCode = 'STORAGE_UNAVAILABLE' | 'BUSY' | 'CREATE_FAILED'
// One ledger per caller: the user path through Prisma models, the daily job through its own functions.
type PointLedger = {
  createdById: string | null
  begin(): Promise<string | null>
  snapshot(pointId: string): Promise<CapturedSnapshot>
  finish(pointId: string, outcome: CaptureOutcome): Promise<RecoveryPointRow | null>
  fail(pointId: string, reason: string, changes: Record<string, unknown>): Promise<void>
  retentionCandidates(): Promise<string[]>
  retire(pointId: string): Promise<void>
}
type SnapshotRow = { data: string; rowCounts: string; migration: string; capturedAt: string }

const logger = new Logger('RecoveryPointCaptureService')
const FAILURE_REASONS: Record<FailureCode, string> = {
  STORAGE_UNAVAILABLE: 'Backup storage was unavailable.',
  BUSY: 'Another backup or restore was running.',
  CREATE_FAILED: 'The backup could not be completed.',
}

export const backupBusy = () =>
  new ConflictException({ message: BACKUP_MESSAGES.BUSY, code: 'BUSY' })
export const isBackupBusy = (error: unknown) =>
  error instanceof ConflictException && (error.getResponse() as { code?: unknown }).code === 'BUSY'

// The capture call shared by both ledgers; a held lock answers BUSY instead of a raw database error.
async function captureSnapshot(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT set_config('statement_timeout', ${BACKUP_STATEMENT_TIMEOUT_MS}, true)`
  try {
    const [row] = await tx.$queryRaw<SnapshotRow[]>`SELECT s::text AS data,
      (s->'rowCounts')::text AS "rowCounts", s->>'migration' AS migration, s->>'capturedAt' AS "capturedAt"
      FROM pathways.p91_capture_organization(${organizationId}::uuid) AS s`
    if (!row) throw new Error('The capture returned no snapshot.')
    return { ...row, rowCounts: JSON.parse(row.rowCounts) as Record<string, number> }
  } catch (error) {
    if (prismaSqlState(error) === '55P03') throw backupBusy()
    throw error
  }
}

@Injectable()
export class RecoveryPointCaptureService {
  private readonly fileMode = readApiEnv(process.env).BACKUP_FILE_MODE

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BackupStorage) private readonly storage: BackupStorage,
    @Inject(BackupJobDatabase) private readonly jobDatabase: BackupJobDatabase,
  ) {}

  /** A manual or pre-restore point; a pre-restore point runs no retention until its restore commits. */
  async capture(
    identity: ApplicationIdentity,
    pointType: 'MANUAL' | 'PRE_RESTORE',
  ): Promise<RecoveryPointRow> {
    const ledger = this.userLedger(identity, pointType)
    const row = await this.run(ledger, identity.organizationId, pointType, pointType === 'MANUAL')
    if (!row) throw new Error('The recovery point was not returned.')
    return row
  }

  /** Pre-restore retention after a committed restore, so failed attempts never evict an undo point; `keepPointId` is the point restored. */
  async retainPreRestore(identity: ApplicationIdentity, keepPointId: string): Promise<void> {
    await this.retain(
      this.userLedger(identity, 'PRE_RESTORE', keepPointId),
      identity.organizationId,
    )
  }

  /** One automatic point on the job login. */
  async captureAutomatic(organizationId: string): Promise<void> {
    await this.run(this.jobLedger(organizationId), organizationId, 'AUTOMATIC')
  }

  async runDaily(): Promise<{ state: 'COMPLETED'; created: number; failed: number }> {
    const organizations = await this.jobDatabase.withBackupJobContext(
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`SELECT id::text AS id FROM pathways.p91_job_organizations() AS id`,
    )
    let created = 0
    let failed = 0
    for (const { id } of organizations) {
      try {
        await this.captureAutomatic(id)
        created++
      } catch (error) {
        failed++
        logger.error({
          event: 'PATHWAYS_BACKUP_JOB_FAILED',
          organizationId: id,
          cause: faultCause(error),
        })
      }
    }
    return { state: 'COMPLETED', created, failed }
  }

  private async run(
    ledger: PointLedger,
    organizationId: string,
    pointType: PointType,
    retain = true,
  ) {
    const pointId = await ledger.begin()
    if (!pointId) throw backupBusy()
    let row: RecoveryPointRow | null
    try {
      const snapshot = await ledger.snapshot(pointId)
      const outcome = await this.store(
        organizationId,
        pointId,
        pointType,
        ledger.createdById,
        snapshot,
      )
      row = await ledger.finish(pointId, outcome)
    } catch (error) {
      throw await this.failed(ledger, organizationId, pointId, pointType, error)
    }
    if (retain) await this.retain(ledger, organizationId)
    return row
  }

  // Storage writes run outside every database transaction.
  private async store(
    organizationId: string,
    pointId: string,
    pointType: PointType,
    createdById: string | null,
    snapshot: CapturedSnapshot,
  ): Promise<CaptureOutcome> {
    const prefix = pointPrefix(organizationId, pointId)
    const files = await this.storage.listOrganizationFiles(organizationId)
    let copiedBytes = 0
    if (this.fileMode === 'copy') {
      for (const file of files) {
        await this.storage.copy(file.name, pointCopyPath(organizationId, pointId, file.name))
        copiedBytes += file.size
      }
    }
    const data = gzipSync(Buffer.from(snapshot.data, 'utf8'))
    await this.storage.write(`${prefix}/${BACKUP_DATA_FILE}`, data, 'application/gzip')
    const manifest: RecoveryPointManifest = {
      format: RECOVERY_POINT_MANIFEST_FORMAT,
      pointId,
      organizationId,
      pointType,
      fileMode: this.fileMode,
      createdById,
      capturedAt: snapshot.capturedAt,
      migration: snapshot.migration,
      rowCounts: snapshot.rowCounts,
      dataFile: { name: BACKUP_DATA_FILE, size: data.length, sha256: sha256Hex(data) },
      files,
    }
    const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8')
    await this.storage.write(`${prefix}/${BACKUP_MANIFEST_FILE}`, manifestBytes, 'application/json')
    const sizeBytes = data.length + manifestBytes.length + copiedBytes
    return {
      capturedAt: snapshot.capturedAt,
      migration: snapshot.migration,
      sizeBytes,
      manifestSha256: sha256Hex(manifestBytes),
      changes: {
        pointType,
        fileMode: this.fileMode,
        migration: snapshot.migration,
        capturedAt: snapshot.capturedAt,
        rowCounts: snapshot.rowCounts,
        fileCount: files.length,
        sizeBytes,
      },
    }
  }

  // Removes what was written, records the failure, and returns the error to answer with.
  private async failed(
    ledger: PointLedger,
    organizationId: string,
    pointId: string,
    pointType: PointType,
    error: unknown,
  ) {
    const code: FailureCode =
      error instanceof BackupStorageUnavailableError
        ? 'STORAGE_UNAVAILABLE'
        : isBackupBusy(error)
          ? 'BUSY'
          : 'CREATE_FAILED'
    // A busy refusal is expected contention; every real failure keeps its allowlisted cause.
    if (code !== 'BUSY')
      logger.error({ event: 'PATHWAYS_BACKUP_CREATE_FAILED', code, cause: faultCause(error) })
    try {
      const files = await this.storage.listPointFiles(organizationId, pointId)
      await this.storage.removePoint(
        organizationId,
        pointId,
        files.map((file) => file.name),
      )
    } catch {
      // Leftover files of a failed point are removed with it by retention.
    }
    try {
      await ledger.fail(pointId, FAILURE_REASONS[code], {
        pointType,
        fileMode: this.fileMode,
        code,
      })
    } catch {
      logger.error({ event: 'PATHWAYS_BACKUP_FAILURE_NOT_RECORDED' })
    }
    if (code === 'BUSY') return backupBusy()
    if (code === 'STORAGE_UNAVAILABLE')
      return new ServiceUnavailableException({
        message: BACKUP_MESSAGES.STORAGE_UNAVAILABLE,
        code,
      })
    return new InternalServerErrorException({ message: BACKUP_MESSAGES.CREATE_FAILED, code })
  }

  private async retain(ledger: PointLedger, organizationId: string) {
    try {
      for (const pointId of await ledger.retentionCandidates()) {
        const files = await this.storage.listPointFiles(organizationId, pointId)
        await this.storage.removePoint(
          organizationId,
          pointId,
          files.map((file) => file.name),
        )
        await ledger.retire(pointId)
      }
    } catch {
      logger.error({ event: 'PATHWAYS_BACKUP_RETENTION_FAILED' })
    }
  }

  private userLedger(
    identity: ApplicationIdentity,
    pointType: 'MANUAL' | 'PRE_RESTORE',
    keepPointId?: string,
  ): PointLedger {
    const organizationId = identity.organizationId
    const access = pointType === 'PRE_RESTORE' ? { alsoAllow: ['backups.restore'] as const } : {}
    const write = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
      withAuthorizedOperation(this.prisma, identity, 'backups.create', work, access)
    return {
      createdById: identity.userId,
      begin: () =>
        write(async (tx) => {
          await tx.recoveryPoint.updateMany({
            where: {
              organizationId,
              status: 'CREATING',
              startedAt: { lt: new Date(Date.now() - BACKUP_STALE_AFTER_MS) },
            },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              failureReason: 'The backup did not finish.',
            },
          })
          const running = await tx.recoveryPoint.findFirst({
            where: { organizationId, status: 'CREATING' },
            select: { id: true },
          })
          if (running) {
            // Returned, not thrown, so this audit row commits.
            await writeAuditLog(tx, identity, {
              action: 'BACKUP_FAILED',
              entityType: 'RECOVERY_POINT',
              entityId: null,
              changes: { pointType, code: 'BUSY' },
            })
            return null
          }
          const created = await tx.recoveryPoint.create({
            data: {
              organizationId,
              pointType,
              fileMode: this.fileMode,
              createdById: identity.userId,
            },
            select: { id: true },
          })
          return created.id
        }),
      snapshot: () =>
        withAuthorizedOperation(
          this.prisma,
          identity,
          'backups.create',
          (tx) => captureSnapshot(tx, organizationId),
          {
            ...access,
            isolationLevel: 'RepeatableRead',
            transactionTimeoutMs: BACKUP_TRANSACTION_TIMEOUT_MS,
            backupTimeout: true,
          },
        ),
      finish: (pointId, outcome) =>
        write(async (tx) => {
          const row = await tx.recoveryPoint.update({
            where: { id: pointId, organizationId },
            data: {
              status: 'READY',
              capturedAt: new Date(outcome.capturedAt),
              completedAt: new Date(),
              migrationName: outcome.migration,
              sizeBytes: BigInt(outcome.sizeBytes),
              manifestSha256: outcome.manifestSha256,
            },
            include: createdBy,
          })
          await writeAuditLog(tx, identity, {
            action: 'BACKUP_CREATED',
            entityType: 'RECOVERY_POINT',
            entityId: pointId,
            changes: outcome.changes as Prisma.InputJsonObject,
          })
          return row
        }),
      fail: async (pointId, reason, changes) => {
        await write(async (tx) => {
          await tx.recoveryPoint.update({
            where: { id: pointId, organizationId },
            data: { status: 'FAILED', completedAt: new Date(), failureReason: reason },
          })
          await writeAuditLog(tx, identity, {
            action: 'BACKUP_FAILED',
            entityType: 'RECOVERY_POINT',
            entityId: pointId,
            changes: changes as Prisma.InputJsonObject,
          })
        })
      },
      retentionCandidates: () =>
        write(async (tx) => {
          const rows = await tx.recoveryPoint.findMany({
            where: { organizationId, pointType },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            select: { id: true, status: true, startedAt: true },
          })
          const cutoff = rows.filter((row) => row.status === 'READY')[
            BACKUP_RETENTION[pointType] - 1
          ]?.startedAt
          if (!cutoff) return []
          const floor =
            pointType === 'PRE_RESTORE'
              ? Date.now() - PRE_RESTORE_MIN_AGE_MS
              : Number.POSITIVE_INFINITY
          return rows
            .filter(
              (row) =>
                row.status !== 'CREATING' &&
                row.startedAt < cutoff &&
                row.startedAt.getTime() < floor &&
                row.id !== keepPointId,
            )
            .map((row) => row.id)
        }),
      retire: async (pointId) => {
        const { count } = await write((tx) =>
          tx.recoveryPoint.deleteMany({ where: { id: pointId, organizationId } }),
        )
        if (count !== 1) throw new Error('A retired recovery point row was not deleted.')
      },
    }
  }

  private jobLedger(organizationId: string): PointLedger {
    const job = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
      this.jobDatabase.withBackupJobContext(work)
    return {
      createdById: null,
      begin: async () => {
        const [row] = await job(
          (tx) => tx.$queryRaw<{ id: string | null }[]>`SELECT
            pathways.p91_job_begin_point(${organizationId}::uuid, ${this.fileMode})::text AS id`,
        )
        return row?.id ?? null
      },
      snapshot: () =>
        this.jobDatabase.withBackupJobContext((tx) => captureSnapshot(tx, organizationId), {
          isolationLevel: 'RepeatableRead',
          timeoutMs: BACKUP_TRANSACTION_TIMEOUT_MS,
        }),
      // The void job functions run through $executeRaw, which reads no result column.
      finish: async (pointId, outcome) => {
        await job(
          (tx) => tx.$executeRaw`SELECT pathways.p91_job_finish_point(${organizationId}::uuid,
            ${pointId}::uuid, ${JSON.stringify(outcome)}::jsonb)`,
        )
        return null
      },
      fail: async (pointId, reason, changes) => {
        await job(
          (tx) => tx.$executeRaw`SELECT pathways.p91_job_fail_point(${organizationId}::uuid,
            ${pointId}::uuid, ${reason}, ${JSON.stringify(changes)}::jsonb)`,
        )
      },
      retentionCandidates: async () =>
        (
          await job(
            (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id
              FROM pathways.p91_job_retention_points(${organizationId}::uuid) AS id`,
          )
        ).map((row) => row.id),
      retire: async (pointId) => {
        const [row] = await job(
          (tx) => tx.$queryRaw<{ deleted: boolean }[]>`SELECT
            pathways.p91_job_delete_point(${organizationId}::uuid, ${pointId}::uuid) AS deleted`,
        )
        if (row?.deleted !== true) throw new Error('A retired recovery point row was not deleted.')
      },
    }
  }
}
