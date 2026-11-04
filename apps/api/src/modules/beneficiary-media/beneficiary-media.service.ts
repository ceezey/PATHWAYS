import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Prisma } from '@prisma/client'

import {
  type BeneficiaryMediaItemResponse,
  type BeneficiaryMediaLimitsResponse,
  type BeneficiaryMediaReservationResponse,
  MAX_BENEFICIARY_MEDIA_FILES,
  type ReserveBeneficiaryMediaRequest,
  aggregateOnlyRoles,
  beneficiaryMediaContentTypes,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  activityEvidenceType,
  evidenceExtension,
  proofDeclarations,
} from '../activities/activity-proof.helpers'
import { streamVerifiedMedia, verifyUploadedMedia } from '../activities/private-media-access'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'

const MAX_LISTED_MEDIA = 100
const unavailable = () => new NotFoundException('Beneficiary media unavailable.')

@Injectable()
export class BeneficiaryMediaService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}

  limits() {
    return {
      maxFiles: MAX_BENEFICIARY_MEDIA_FILES,
      maxFileBytes: this.env.EVIDENCE_MAX_FILE_BYTES,
      contentTypes: [...beneficiaryMediaContentTypes],
    } satisfies BeneficiaryMediaLimitsResponse
  }

  /** Aggregate-only roles are denied first; then project assignment and the enrollment are resolved. */
  private async requireEnrollment(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
  ) {
    if (aggregateOnlyRoles.includes(actor.roles[0]))
      throw new ForbiddenException('Aggregate access only.')
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(beneficiaryId)) throw unavailable()
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw unavailable()
    const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: project.id,
        beneficiaryId: beneficiaryId.toLowerCase(),
      },
      select: { id: true },
    })
    if (!enrollment) throw unavailable()
    return { projectId: project.id, enrollmentId: enrollment.id }
  }

  private async requireMedia(
    tx: Tx,
    actor: ApplicationIdentity,
    scope: { projectId: string; enrollmentId: string },
    mediaId: string,
    where: Prisma.EvidenceMediaWhereInput = {},
  ) {
    if (!UUID_PATTERN.test(mediaId)) throw unavailable()
    const row = await tx.evidenceMedia.findFirst({
      where: {
        ...where,
        organizationId: actor.organizationId,
        projectId: scope.projectId,
        enrollmentId: scope.enrollmentId,
        id: mediaId.toLowerCase(),
      },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        byteSize: true,
        sha256: true,
        contentType: true,
        storageReady: true,
      },
    })
    if (!row) throw unavailable()
    return row
  }

  list(identity: ApplicationIdentity, projectId: string, beneficiaryId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const scope = await this.requireEnrollment(tx, actor, projectId, beneficiaryId)
        const rows = await tx.evidenceMedia.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: scope.projectId,
            enrollmentId: scope.enrollmentId,
            storageReady: true,
          },
          select: {
            id: true,
            type: true,
            fileName: true,
            contentType: true,
            byteSize: true,
            description: true,
            submittedAt: true,
            storageReady: true,
            submittedBy: { select: { fullName: true } },
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
          take: MAX_LISTED_MEDIA,
        })
        return rows.map(
          (row): BeneficiaryMediaItemResponse => ({
            id: row.id,
            type: row.type,
            fileName: row.fileName,
            contentType: row.contentType,
            byteSize: Number(row.byteSize),
            description: row.description,
            submittedAt: row.submittedAt.toISOString(),
            submittedBy: row.submittedBy.fullName,
            storageReady: row.storageReady,
          }),
        )
      },
    )
  }

  /** Creates one unready row per declared file and returns a signed upload URL for each. */
  async reserve(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: ReserveBeneficiaryMediaRequest,
  ) {
    if (
      !Array.isArray(input.files) ||
      input.files.some((file) => !beneficiaryMediaContentTypes.includes(file.contentType))
    )
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'PROOF_FILE_INVALID',
        message: 'A media file has an invalid name or type.',
      })
    const declared = proofDeclarations(input.files, this.env.EVIDENCE_MAX_FILE_BYTES)
    const note = input.note?.trim() || null
    const rows = await withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        const scope = await this.requireEnrollment(tx, actor, projectId, beneficiaryId)
        const created = declared.map((file) => {
          const id = randomUUID()
          return {
            id,
            ...file,
            objectKey: `organizations/${actor.organizationId}/projects/${scope.projectId}/evidence/${id}/proof${evidenceExtension[file.contentType]}`,
          }
        })
        await tx.evidenceMedia.createMany({
          data: created.map((row) => ({
            id: row.id,
            organizationId: actor.organizationId,
            projectId: scope.projectId,
            enrollmentId: scope.enrollmentId,
            type: activityEvidenceType(row.contentType),
            fileName: row.fileName,
            bucket: this.env.EVIDENCE_BUCKET,
            objectKey: row.objectKey,
            sha256: row.sha256,
            byteSize: BigInt(row.byteSize),
            contentType: row.contentType,
            storageReady: false,
            description: note,
            submittedById: actor.userId,
          })),
        })
        await writeAuditLog(tx, actor, {
          projectId: scope.projectId,
          action: 'BENEFICIARY_MEDIA_RESERVED',
          entityType: 'BeneficiaryProjectEnrollment',
          entityId: scope.enrollmentId,
          changes: { mediaIds: created.map((row) => row.id), fileCount: created.length },
        })
        return created
      },
    )
    try {
      const signed = await this.storage.createPrivateUploadUrls(
        this.env.EVIDENCE_BUCKET,
        rows.map((row) => row.objectKey),
      )
      return {
        files: rows.map((row, index) => {
          if (signed[index]?.path !== row.objectKey) throw new Error('Unexpected upload URL')
          return {
            mediaId: row.id,
            fileName: row.fileName,
            contentType: row.contentType,
            byteSize: row.byteSize,
            sha256: row.sha256,
            uploadUrl: signed[index].uploadUrl,
          }
        }),
      } satisfies BeneficiaryMediaReservationResponse
    } catch {
      throw new ServiceUnavailableException('Media upload could not be prepared. Retry the upload.')
    }
  }

  /** Verifies the uploaded object outside any transaction, then marks the row ready. */
  async finalize(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ) {
    const readTarget = async (tx: Tx, actor: ApplicationIdentity) => {
      const scope = await this.requireEnrollment(tx, actor, projectId, beneficiaryId)
      const row = await this.requireMedia(tx, actor, scope, mediaId, {
        submittedById: actor.userId,
      })
      return { scope, row }
    }
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => ({
        ...(await readTarget(tx, actor)),
        organizationId: actor.organizationId,
      }),
    )
    if (initial.row.storageReady) return { mediaId: initial.row.id, storageReady: true as const }
    const { row } = initial
    await verifyUploadedMedia(this.env, this.storage, this.storageFactories, {
      organizationId: initial.organizationId,
      projectId: initial.scope.projectId,
      row,
    })
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        const current = await readTarget(tx, actor)
        await tx.$queryRaw`SELECT id FROM pathways.evidence_media WHERE organization_id=${actor.organizationId}::uuid
          AND project_id=${current.scope.projectId}::uuid AND id=${row.id}::uuid FOR UPDATE`
        if (current.row.storageReady) return { mediaId: row.id, storageReady: true as const }
        const marked = await tx.evidenceMedia.updateMany({
          where: {
            id: row.id,
            organizationId: actor.organizationId,
            projectId: current.scope.projectId,
            enrollmentId: current.scope.enrollmentId,
            submittedById: actor.userId,
            storageReady: false,
          },
          data: { storageReady: true },
        })
        if (marked.count !== 1)
          throw new ConflictException('Media changed. Retry finalizing this file.')
        await writeAuditLog(tx, actor, {
          projectId: current.scope.projectId,
          action: 'BENEFICIARY_MEDIA_FINALIZED',
          entityType: 'EvidenceMedia',
          entityId: row.id,
          changes: { enrollmentId: current.scope.enrollmentId },
        })
        return { mediaId: row.id, storageReady: true as const }
      },
    )
  }

  /** Streams a verified file; the stream withholds its last bytes unless size and digest still match. */
  async content(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ) {
    const target = await withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const scope = await this.requireEnrollment(tx, actor, projectId, beneficiaryId)
        const row = await this.requireMedia(tx, actor, scope, mediaId, { storageReady: true })
        return { scope, row, organizationId: actor.organizationId }
      },
    )
    return streamVerifiedMedia(this.env, this.storageFactories, {
      organizationId: target.organizationId,
      projectId: target.scope.projectId,
      row: target.row,
    })
  }
}
