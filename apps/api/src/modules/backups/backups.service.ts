import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type DownloadRecoveryPointRequest,
  type RecoveryPointDownload,
  type RecoveryPointList,
  type RecoveryPointListItem,
  type RecoveryPointVerifyResult,
  type RestoreRecoveryPointRequest,
  type RestoreRecoveryPointResult,
  recoveryPointProblemMessages,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { faultCause, prismaSqlState } from '../../prisma/transaction-diagnostic'
import {
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  BackupStorage,
  BackupStorageUnavailableError,
  downloadsPrefix,
  pointCopyPath,
  pointPrefix,
} from './backup-storage'
import { toRecoveryPointItem } from './backups.mapper'
import {
  BACKUP_MESSAGES,
  BACKUP_STALE_AFTER_MS,
  BACKUP_STATEMENT_TIMEOUT_MS,
  BACKUP_TRANSACTION_TIMEOUT_MS,
  RecoveryPointCaptureService,
  type RecoveryPointRow,
  backupBusy,
  isBackupBusy,
} from './recovery-point-capture.service'
import { checkRecoveryPoint } from './recovery-point-check'
import { encryptRecoveryPoint } from './recovery-point-encryption'

export const DOWNLOAD_URL_SECONDS = 120
export const DOWNLOAD_COPY_MAX_AGE_MS = 15 * 60 * 1000
export const RESTORE_MESSAGES = {
  CODE_MISMATCH: 'The organization code does not match.',
  PRE_RESTORE_FAILED: 'The safety backup before the restore failed, so nothing was changed.',
  FILE_RESTORE_FAILED: 'Files could not be brought back. The database was not changed.',
  INCOMPATIBLE: 'This recovery point does not match this database and cannot be restored.',
  RESTORE_FAILED: 'The restore failed and was undone. Nothing was changed.',
} as const
const logger = new Logger('BackupsService')
const restoreFailed = (code = 'RESTORE_FAILED') =>
  new InternalServerErrorException({ message: RESTORE_MESSAGES.RESTORE_FAILED, code })
// Any non-Http error inside the restore transaction answers RESTORE_FAILED instead of the wrapper's 403.
const restoreWork =
  <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  async (tx: Prisma.TransactionClient) => {
    try {
      return await work(tx)
    } catch (error) {
      if (error instanceof HttpException) throw error
      logger.error({ event: 'PATHWAYS_BACKUP_RESTORE_FAILED', cause: faultCause(error) })
      throw restoreFailed()
    }
  }
const responseCode = (error: unknown) =>
  error instanceof HttpException
    ? ((error.getResponse() as { code?: unknown }).code as string | undefined)
    : undefined
const createdBy = { createdBy: { select: { id: true, fullName: true } } } as const

export const backupNotFound = () =>
  new NotFoundException({ message: 'Recovery point not found.', code: 'NOT_FOUND' })
export const backupStorageUnavailable = () =>
  new ServiceUnavailableException({
    message: BACKUP_MESSAGES.STORAGE_UNAVAILABLE,
    code: 'STORAGE_UNAVAILABLE',
  })
// Storage outages answer 503; everything else keeps its own error.
const storageCall = async <T>(work: () => Promise<T>) => {
  try {
    return await work()
  } catch (error) {
    if (error instanceof BackupStorageUnavailableError) throw backupStorageUnavailable()
    throw error
  }
}

export async function currentMigration(tx: Prisma.TransactionClient): Promise<string> {
  const [row] = await tx.$queryRaw<
    { migration: string }[]
  >`SELECT pathways.p91_current_migration() AS migration`
  return row?.migration ?? ''
}

export async function findPoint(
  tx: Prisma.TransactionClient,
  identity: ApplicationIdentity,
  pointId: string,
): Promise<RecoveryPointRow | null> {
  if (!UUID_PATTERN.test(pointId)) return null
  return tx.recoveryPoint.findFirst({
    where: { id: pointId, organizationId: identity.organizationId },
    include: createdBy,
  })
}

@Injectable()
export class BackupsService {
  private readonly fileMode = readApiEnv(process.env).BACKUP_FILE_MODE

  constructor(
    @Inject(PrismaService) protected readonly prisma: PrismaService,
    @Inject(BackupStorage) protected readonly storage: BackupStorage,
    @Inject(RecoveryPointCaptureService) protected readonly capture: RecoveryPointCaptureService,
  ) {}

  private read<T>(
    identity: ApplicationIdentity,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'backups.create', work, {
      alsoAllow: ['backups.restore'],
    })
  }

  // Best effort: a cleanup fault must not block a list or a download.
  private async removeStaleDownloads(orgId: string) {
    try {
      await this.storage.removeStaleDownloads(orgId, Date.now() - DOWNLOAD_COPY_MAX_AGE_MS)
    } catch {
      logger.error({ event: 'PATHWAYS_BACKUP_DOWNLOAD_CLEANUP_FAILED' })
    }
  }

  async list(identity: ApplicationIdentity): Promise<RecoveryPointList> {
    await this.removeStaleDownloads(identity.organizationId)
    return this.read(identity, async (tx) => {
      const rows = await tx.recoveryPoint.findMany({
        where: { organizationId: identity.organizationId },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include: createdBy,
      })
      const migration = await currentMigration(tx)
      const organization = await tx.organization.findFirst({
        where: { id: identity.organizationId },
        select: { code: true },
      })
      const now = new Date()
      return {
        points: rows.map((row) => toRecoveryPointItem(row, migration, now)),
        currentMigration: migration,
        fileMode: this.fileMode,
        organizationCode: organization?.code ?? '',
      }
    })
  }

  async create(identity: ApplicationIdentity): Promise<RecoveryPointListItem> {
    const row = await this.capture.capture(identity, 'MANUAL')
    return toRecoveryPointItem(row, row.migrationName ?? '', new Date())
  }

  /** Stores what the check found: a failing READY point becomes UNAVAILABLE, a passing UNAVAILABLE one READY. */
  async verify(identity: ApplicationIdentity, pointId: string): Promise<RecoveryPointVerifyResult> {
    const { row, migration } = await this.read(identity, async (tx) => ({
      row: await findPoint(tx, identity, pointId),
      migration: await currentMigration(tx),
    }))
    if (!row) throw backupNotFound()
    const unavailable = row.status === 'UNAVAILABLE'
    const check = await storageCall(() =>
      checkRecoveryPoint({
        organizationId: identity.organizationId,
        point: {
          id: row.id,
          status: unavailable ? 'READY' : row.status,
          manifestSha256: row.manifestSha256,
        },
        currentMigration: migration,
        storage: this.storage,
      }),
    )
    const data =
      check.problem === null
        ? unavailable
          ? { status: 'READY', failureReason: null }
          : null
        : check.markUnavailable && row.status === 'READY'
          ? { status: 'UNAVAILABLE', failureReason: recoveryPointProblemMessages[check.problem] }
          : null
    const point = data
      ? await this.read(identity, (tx) =>
          tx.recoveryPoint.update({
            where: { id: row.id, organizationId: identity.organizationId },
            data,
            include: createdBy,
          }),
        )
      : row
    return { point: toRecoveryPointItem(point, migration, new Date()), problem: check.problem }
  }

  async download(
    identity: ApplicationIdentity,
    pointId: string,
    input: DownloadRecoveryPointRequest,
  ): Promise<RecoveryPointDownload> {
    const row = await this.read(identity, (tx) => findPoint(tx, identity, pointId))
    if (!row) throw backupNotFound()
    if (row.status !== 'READY' && row.status !== 'UNAVAILABLE')
      throw new ConflictException({
        message: recoveryPointProblemMessages.NOT_READY,
        code: 'NOT_READY',
      })
    await this.removeStaleDownloads(identity.organizationId)
    const prefix = pointPrefix(identity.organizationId, row.id)
    const [data, manifest] = await storageCall(() =>
      Promise.all([
        this.storage.read(`${prefix}/${BACKUP_DATA_FILE}`),
        this.storage.read(`${prefix}/${BACKUP_MANIFEST_FILE}`),
      ]),
    )
    if (!data || !manifest)
      throw new ConflictException({
        message: recoveryPointProblemMessages.DATA_FILE_MISSING,
        code: 'DATA_FILE_MISSING',
      })
    // Each copy name carries a random id because the upload never overwrites.
    const copy = `${downloadsPrefix(identity.organizationId)}/${Date.now()}-${randomUUID()}`
    const [dataUrl, manifestUrl] = await storageCall(async () => {
      // The bucket accepts only listed types, so the manifest copy is stored as application/gzip too.
      await Promise.all([
        this.storage.write(
          `${copy}.data.pwrp`,
          encryptRecoveryPoint(data, input.passphrase),
          'application/gzip',
        ),
        this.storage.write(
          `${copy}.manifest.pwrp`,
          encryptRecoveryPoint(manifest, input.passphrase),
          'application/gzip',
        ),
      ])
      return Promise.all([
        this.storage.signedUrl(
          `${copy}.data.pwrp`,
          DOWNLOAD_URL_SECONDS,
          `recovery-point-${row.id}.json.gz.pwrp`,
        ),
        this.storage.signedUrl(
          `${copy}.manifest.pwrp`,
          DOWNLOAD_URL_SECONDS,
          `recovery-point-${row.id}.manifest.json.pwrp`,
        ),
      ])
    })
    if (!dataUrl || !manifestUrl)
      throw new ConflictException({
        message: recoveryPointProblemMessages.DATA_FILE_MISSING,
        code: 'DATA_FILE_MISSING',
      })
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000).toISOString()
    // The links are returned only after the download is audited.
    await this.read(identity, (tx) =>
      writeAuditLog(tx, identity, {
        action: 'BACKUP_DOWNLOADED',
        entityType: 'RECOVERY_POINT',
        entityId: row.id,
        changes: {
          pointType: row.pointType,
          capturedAt: row.capturedAt?.toISOString() ?? null,
          expiresInSeconds: DOWNLOAD_URL_SECONDS,
        },
      }),
    )
    return { dataUrl, manifestUrl, expiresAt }
  }

  // A refusal or failure record in its own transaction, best effort, before the error is thrown.
  private async auditOutcome(
    identity: ApplicationIdentity,
    action: 'BACKUP_RESTORE_REFUSED' | 'BACKUP_RESTORE_FAILED',
    entityId: string | null,
    changes: Prisma.InputJsonObject,
    markUnavailable?: { pointId: string; reason: string },
  ) {
    try {
      await withAuthorizedOperation(this.prisma, identity, 'backups.restore', async (tx) => {
        if (markUnavailable)
          await tx.recoveryPoint.update({
            where: { id: markUnavailable.pointId, organizationId: identity.organizationId },
            data: { status: 'UNAVAILABLE', failureReason: markUnavailable.reason },
          })
        await writeAuditLog(tx, identity, {
          action,
          entityType: 'RECOVERY_POINT',
          entityId,
          changes,
        })
      })
    } catch {
      logger.error({ event: 'PATHWAYS_BACKUP_AUDIT_FAILED' })
    }
  }

  async restore(
    identity: ApplicationIdentity,
    pointId: string,
    input: RestoreRecoveryPointRequest,
  ): Promise<RestoreRecoveryPointResult> {
    const organizationId = identity.organizationId
    // The gate returns its refusal instead of throwing, so the refusal's audit row commits.
    const gate = await withAuthorizedOperation(
      this.prisma,
      identity,
      'backups.restore',
      async (tx) => {
        const row = await findPoint(tx, identity, pointId)
        const refuse = async (code: 'NOT_FOUND' | 'CODE_MISMATCH' | 'BUSY') => {
          await writeAuditLog(tx, identity, {
            action: 'BACKUP_RESTORE_REFUSED',
            entityType: 'RECOVERY_POINT',
            entityId: row?.id ?? null,
            changes: { code },
          })
          return { refused: code } as const
        }
        if (!row) return refuse('NOT_FOUND')
        const organization = await tx.organization.findFirst({
          where: { id: organizationId },
          select: { code: true },
        })
        if (!organization || input.organizationCode !== organization.code)
          return refuse('CODE_MISMATCH')
        const running = await tx.recoveryPoint.findFirst({
          where: {
            organizationId,
            status: 'CREATING',
            startedAt: { gte: new Date(Date.now() - BACKUP_STALE_AFTER_MS) },
          },
          select: { id: true },
        })
        if (running) return refuse('BUSY')
        return { row, migration: await currentMigration(tx) }
      },
    )
    if ('refused' in gate) {
      if (gate.refused === 'NOT_FOUND') throw backupNotFound()
      if (gate.refused === 'BUSY') throw backupBusy()
      throw new BadRequestException({
        message: RESTORE_MESSAGES.CODE_MISMATCH,
        code: 'CODE_MISMATCH',
      })
    }
    const { row, migration } = gate

    let check: Awaited<ReturnType<typeof checkRecoveryPoint>>
    try {
      check = await checkRecoveryPoint({
        organizationId,
        point: row,
        currentMigration: migration,
        storage: this.storage,
      })
    } catch (error) {
      if (!(error instanceof BackupStorageUnavailableError)) throw error
      await this.auditOutcome(identity, 'BACKUP_RESTORE_REFUSED', row.id, {
        code: 'STORAGE_UNAVAILABLE',
      })
      throw backupStorageUnavailable()
    }
    if (check.problem !== null) {
      const message = recoveryPointProblemMessages[check.problem]
      await this.auditOutcome(
        identity,
        'BACKUP_RESTORE_REFUSED',
        row.id,
        { code: check.problem },
        check.markUnavailable && row.status === 'READY'
          ? { pointId: row.id, reason: message }
          : undefined,
      )
      throw new ConflictException({ message, code: check.problem })
    }
    const { manifest, data, filesToRestore } = check

    let pre: RecoveryPointRow
    try {
      pre = await this.capture.capture(identity, 'PRE_RESTORE')
    } catch (error) {
      await this.auditOutcome(identity, 'BACKUP_RESTORE_FAILED', row.id, {
        code: 'PRE_RESTORE_FAILED',
      })
      const status = isBackupBusy(error)
        ? HttpStatus.CONFLICT
        : responseCode(error) === 'STORAGE_UNAVAILABLE'
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR
      throw new HttpException(
        { message: RESTORE_MESSAGES.PRE_RESTORE_FAILED, code: 'PRE_RESTORE_FAILED' },
        status,
      )
    }

    // Copy mode brings missing or changed files back before the database transaction; nothing is deleted.
    let filesRestored = 0
    if (manifest.fileMode === 'copy') {
      try {
        for (const file of filesToRestore) {
          const copy = pointCopyPath(organizationId, row.id, file.name)
          if ((await this.storage.read(file.name)) === null)
            await this.storage.copy(copy, file.name)
          else {
            const body = await this.storage.read(copy)
            if (!body) throw new Error('The recovery point copy is missing.')
            await this.storage.overwrite(file.name, body, file.contentType)
          }
          filesRestored++
        }
      } catch {
        await this.auditOutcome(identity, 'BACKUP_RESTORE_FAILED', row.id, {
          code: 'FILE_RESTORE_FAILED',
          filesRestored,
        })
        throw new ServiceUnavailableException({
          message: RESTORE_MESSAGES.FILE_RESTORE_FAILED,
          code: 'FILE_RESTORE_FAILED',
        })
      }
    }

    let counts: Record<string, number>
    try {
      counts = await withAuthorizedOperation(
        this.prisma,
        identity,
        'backups.restore',
        restoreWork(async (tx) => {
          await tx.$queryRaw`SELECT set_config('statement_timeout', ${BACKUP_STATEMENT_TIMEOUT_MS}, true)`
          // Rows committed while the restore waits for its locks are visible to its delete only under read committed.
          const [isolation] = await tx.$queryRaw<
            { level: string }[]
          >`SELECT current_setting('transaction_isolation') AS level`
          if (isolation?.level !== 'read committed') {
            logger.error({ event: 'PATHWAYS_BACKUP_RESTORE_ISOLATION_REFUSED' })
            throw restoreFailed()
          }
          let restored: Record<string, number> | null
          try {
            const [result] = await tx.$queryRaw<{ counts: string }[]>`SELECT
              pathways.p91_restore_organization(${organizationId}::uuid,
                ${gunzipSync(data).toString('utf8')}::jsonb,
                ${JSON.stringify(manifest.rowCounts)}::jsonb)::text AS counts`
            restored = JSON.parse(result?.counts ?? 'null') as Record<string, number> | null
          } catch (error) {
            const state = prismaSqlState(error)
            if (state === '55P03') throw backupBusy()
            if (state === '22023')
              throw new ConflictException({
                message: RESTORE_MESSAGES.INCOMPATIBLE,
                code: 'INCOMPATIBLE',
              })
            logger.error({ event: 'PATHWAYS_BACKUP_RESTORE_FAILED', cause: faultCause(error) })
            throw restoreFailed(state === '23514' ? 'COUNT_MISMATCH' : 'RESTORE_FAILED')
          }
          if (!restored || typeof restored !== 'object') throw restoreFailed()
          await writeAuditLog(tx, identity, {
            action: 'BACKUP_RESTORED',
            entityType: 'RECOVERY_POINT',
            entityId: row.id,
            changes: {
              pointType: row.pointType,
              capturedAt: manifest.capturedAt,
              migration: manifest.migration,
              fileMode: manifest.fileMode,
              preRestorePointId: pre.id,
              rowCounts: restored,
              filesRestored,
            },
          })
          return restored
        }),
        { transactionTimeoutMs: BACKUP_TRANSACTION_TIMEOUT_MS, backupTimeout: true },
      )
    } catch (error) {
      const code = responseCode(error) ?? 'RESTORE_FAILED'
      await this.auditOutcome(
        identity,
        code === 'BUSY' || code === 'INCOMPATIBLE'
          ? 'BACKUP_RESTORE_REFUSED'
          : 'BACKUP_RESTORE_FAILED',
        row.id,
        { code },
      )
      if (error instanceof HttpException) throw error
      throw restoreFailed()
    }
    await this.capture.retainPreRestore(identity, row.id)

    return {
      point: toRecoveryPointItem(row, migration, new Date()),
      preRestorePointId: pre.id,
      rowCounts: counts,
      filesRestored,
    }
  }
}
