import { writeAuditLog } from '@app/common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { PrismaService } from '@app/prisma/prisma.service'
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type RecoveryPointDownload,
  type RecoveryPointList,
  type RecoveryPointListItem,
  type RecoveryPointVerifyResult,
  recoveryPointProblemMessages,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import {
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  BackupStorage,
  BackupStorageUnavailableError,
  pointPrefix,
} from './backup-storage'
import { toRecoveryPointItem } from './backups.mapper'
import {
  BACKUP_MESSAGES,
  RecoveryPointCaptureService,
  type RecoveryPointRow,
} from './recovery-point-capture.service'
import { checkRecoveryPoint } from './recovery-point-check'

export const DOWNLOAD_URL_SECONDS = 120
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

  async list(identity: ApplicationIdentity): Promise<RecoveryPointList> {
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

  async download(identity: ApplicationIdentity, pointId: string): Promise<RecoveryPointDownload> {
    const row = await this.read(identity, (tx) => findPoint(tx, identity, pointId))
    if (!row) throw backupNotFound()
    if (row.status !== 'READY' && row.status !== 'UNAVAILABLE')
      throw new ConflictException({
        message: recoveryPointProblemMessages.NOT_READY,
        code: 'NOT_READY',
      })
    const prefix = pointPrefix(identity.organizationId, row.id)
    const [dataUrl, manifestUrl] = await storageCall(() =>
      Promise.all([
        this.storage.signedUrl(
          `${prefix}/${BACKUP_DATA_FILE}`,
          DOWNLOAD_URL_SECONDS,
          `recovery-point-${row.id}.json.gz`,
        ),
        this.storage.signedUrl(
          `${prefix}/${BACKUP_MANIFEST_FILE}`,
          DOWNLOAD_URL_SECONDS,
          `recovery-point-${row.id}.manifest.json`,
        ),
      ]),
    )
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
}
