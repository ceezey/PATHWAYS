import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Prisma } from '@prisma/client'

import {
  MAX_BENEFICIARY_MEDIA_FILES,
  type PublicMediaListResponse,
  type ReservePublicMediaRequest,
  hasAtomicPermission,
  publicMediaContentTypes,
  publicMediaRejectRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  PROOF_STORAGE_DEADLINE_MS,
  activityEvidenceType,
  evidenceExtension,
  proofDeclarations,
} from '../activities/activity-proof.helpers'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'

const MAX_LISTED_MEDIA = 500
const unavailable = () => new NotFoundException('Public media unavailable.')
const rejection = (code: string, message: string) =>
  new UnprocessableEntityException({
    statusCode: 422,
    error: 'Unprocessable Entity',
    code,
    message,
  })
// Rows with no activity, expense or submission link: new uploads and beneficiary media.
const unlinked = { activityId: null, expenseId: null, sourceSubmissionId: null } as const
// Rows the picker and the content route may show: stored photos and videos, never receipts or form files.
const listed = {
  storageReady: true,
  type: { in: ['PHOTO', 'VIDEO'] },
  expenseId: null,
  sourceSubmissionId: null,
  OR: [{ activityUpdateId: { not: null } }, { activityId: null }],
} satisfies Prisma.EvidenceMediaWhereInput

/** Listing and viewing beneficiary-linked media is detail access, so it also needs evidence.read. */
function requireEvidenceRead(actor: ApplicationIdentity) {
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.read'))
    throw new ForbiddenException('Evidence access is required to view media.')
}

@Injectable()
export class PublicMediaService {
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
      contentTypes: [...publicMediaContentTypes],
    }
  }

  /** Reads one row of the actor's project; unknown ids and projects answer 404 without saying why. */
  private async requireMedia(
    tx: Tx,
    actor: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    where: Prisma.EvidenceMediaWhereInput = {},
  ) {
    const projectId = await requireScopedProject(tx, actor, requestedProjectId)
    if (!UUID_PATTERN.test(mediaId)) throw unavailable()
    const row = await tx.evidenceMedia.findFirst({
      where: {
        ...where,
        organizationId: actor.organizationId,
        projectId,
        id: mediaId.toLowerCase(),
      },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        byteSize: true,
        sha256: true,
        contentType: true,
        type: true,
        status: true,
        storageReady: true,
        enrollmentId: true,
        activityId: true,
        expenseId: true,
        sourceSubmissionId: true,
        submittedById: true,
        publicVisibilityStatus: true,
        publicSubmittedById: true,
      },
    })
    if (!row) throw unavailable()
    return { projectId, row }
  }

  list(identity: ApplicationIdentity, requestedProjectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      requireEvidenceRead(actor)
      const projectId = await requireScopedProject(tx, actor, requestedProjectId)
      const rows = await tx.evidenceMedia.findMany({
        where: { ...listed, organizationId: actor.organizationId, projectId },
        select: {
          id: true,
          type: true,
          contentType: true,
          fileName: true,
          status: true,
          storageReady: true,
          publicVisibilityStatus: true,
          submittedById: true,
          publicSubmittedById: true,
          rejectionReason: true,
          activityId: true,
          activityUpdateId: true,
          enrollmentId: true,
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: MAX_LISTED_MEDIA,
      })
      return {
        items: rows.map((row) => ({
          id: row.id,
          type: row.type as 'PHOTO' | 'VIDEO',
          contentType: row.contentType,
          fileName: row.fileName,
          source: row.activityId ? 'ACTIVITY' : row.enrollmentId ? 'BENEFICIARY' : 'UPLOAD',
          status: row.status,
          publicStatus: row.publicVisibilityStatus as 'PRIVATE' | 'FOR_REVIEW' | 'APPROVED',
          submittedById: row.submittedById,
          publicSubmittedById: row.publicSubmittedById,
          rejectionReason: row.rejectionReason,
          // The same rule p85_publication_media applies when a selection is submitted.
          pickable:
            row.storageReady &&
            row.status !== 'REJECTED' &&
            row.contentType.startsWith(row.type === 'PHOTO' ? 'image/' : 'video/') &&
            ((row.activityUpdateId !== null && ['VERIFIED', 'APPROVED'].includes(row.status)) ||
              row.publicVisibilityStatus === 'APPROVED'),
        })),
      } satisfies PublicMediaListResponse
    })
  }

  /** Creates one unready, unlinked row per declared file and returns a signed upload URL for each. */
  async reserve(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    input: ReservePublicMediaRequest,
  ) {
    if (
      !Array.isArray(input.files) ||
      input.files.some((file) => !publicMediaContentTypes.includes(file.contentType))
    )
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'PROOF_FILE_INVALID',
        message: 'A media file has an invalid name or type.',
      })
    const declared = proofDeclarations(input.files, this.env.EVIDENCE_MAX_FILE_BYTES)
    const rows = await withAuthorizedOperation(
      this.prisma,
      identity,
      'public.preview',
      async (tx, actor) => {
        const projectId = await requireScopedProject(tx, actor, requestedProjectId)
        const created = declared.map((file) => {
          const id = randomUUID()
          return {
            id,
            ...file,
            objectKey: `organizations/${actor.organizationId}/projects/${projectId}/evidence/${id}/proof${evidenceExtension[file.contentType]}`,
          }
        })
        await tx.evidenceMedia.createMany({
          data: created.map((row) => ({
            id: row.id,
            organizationId: actor.organizationId,
            projectId,
            type: activityEvidenceType(row.contentType),
            fileName: row.fileName,
            bucket: this.env.EVIDENCE_BUCKET,
            objectKey: row.objectKey,
            sha256: row.sha256,
            byteSize: BigInt(row.byteSize),
            contentType: row.contentType,
            storageReady: false,
            submittedById: actor.userId,
          })),
        })
        await writeAuditLog(tx, actor, {
          projectId,
          action: 'PUBLIC_MEDIA_RESERVED',
          entityType: 'Project',
          entityId: projectId,
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
      }
    } catch {
      throw new ServiceUnavailableException('Media upload could not be prepared. Retry the upload.')
    }
  }

  /** Verifies the uploaded object outside any transaction, then marks the row ready and queues it. */
  async finalize(identity: ApplicationIdentity, requestedProjectId: string, mediaId: string) {
    const uploaded = (actor: ApplicationIdentity) => ({
      ...unlinked,
      enrollmentId: null,
      submittedById: actor.userId,
    })
    const readTarget = (tx: Tx, actor: ApplicationIdentity) =>
      this.requireMedia(tx, actor, requestedProjectId, mediaId, uploaded(actor))
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'public.preview',
      async (tx, actor) => ({
        ...(await readTarget(tx, actor)),
        organizationId: actor.organizationId,
      }),
    )
    const { row } = initial
    if (row.storageReady) return { mediaId: row.id, publicStatus: 'FOR_REVIEW' as const }
    const byteSize = Number(row.byteSize)
    if (!Number.isSafeInteger(byteSize) || byteSize > this.env.EVIDENCE_MAX_FILE_BYTES)
      throw rejection('PROOF_FILE_TOO_LARGE', 'The media file exceeds the current per-file limit.')
    let outcome: Awaited<
      ReturnType<ReturnType<PrivateStorageFactories['createPrivateUploadVerifier']>>
    >
    try {
      const verify = this.storageFactories.createPrivateUploadVerifier({
        serviceOrigin: this.env.SUPABASE_URL ?? '',
        serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        evidenceBucket: this.env.EVIDENCE_BUCKET,
        maxBytes: this.env.EVIDENCE_MAX_FILE_BYTES,
        storageDeadlineMs: PROOF_STORAGE_DEADLINE_MS,
      })
      outcome = await verify({
        organizationId: initial.organizationId,
        projectId: initial.projectId,
        evidenceId: row.id,
        bucket: row.bucket,
        objectKey: row.objectKey,
        expectedBytes: byteSize,
        expectedSha256: row.sha256,
        contentType: row.contentType,
        signal: new AbortController().signal,
        deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
      })
    } catch {
      throw new ServiceUnavailableException(
        'Media verification is temporarily unavailable. Retry finalizing this file.',
      )
    }
    if (outcome !== 'VERIFIED') {
      if (outcome !== 'OBJECT_MISSING')
        await this.storage.deleteFile(row.bucket, row.objectKey).catch(() => undefined)
      throw rejection(
        `PROOF_${outcome}`,
        outcome === 'OBJECT_MISSING'
          ? 'The media file was not uploaded. Upload it, then finalize again.'
          : 'The uploaded media file does not match its declaration.',
      )
    }
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      const current = await readTarget(tx, actor)
      if (current.row.storageReady) return { mediaId: row.id, publicStatus: 'FOR_REVIEW' as const }
      return this.queue(tx, actor, current.projectId, row.id, {
        ...uploaded(actor),
        storageReady: false,
      })
    })
  }

  /** Moves one PRIVATE row to FOR_REVIEW as the acting user; the database guard requires that user. */
  private async queue(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    mediaId: string,
    where: Prisma.EvidenceMediaWhereInput,
  ) {
    const moved = await tx.evidenceMedia.updateMany({
      where: {
        ...where,
        id: mediaId,
        organizationId: actor.organizationId,
        projectId,
        publicVisibilityStatus: 'PRIVATE',
      },
      data: {
        storageReady: true,
        publicVisibilityStatus: 'FOR_REVIEW',
        publicSubmittedById: actor.userId,
        publicSubmittedAt: new Date(),
      },
    })
    if (moved.count !== 1) throw new ConflictException('Media changed. Retry finalizing this file.')
    await writeAuditLog(tx, actor, {
      projectId,
      action: 'PUBLIC_MEDIA_SUBMITTED',
      entityType: 'EvidenceMedia',
      entityId: mediaId,
      changes: {},
    })
    return { mediaId, publicStatus: 'FOR_REVIEW' as const }
  }

  /** Sends ready beneficiary photos and videos to the queue; uploads are queued when finalized. */
  submit(identity: ApplicationIdentity, requestedProjectId: string, mediaId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      const { projectId, row } = await this.requireMedia(tx, actor, requestedProjectId, mediaId)
      if (
        row.enrollmentId === null ||
        row.activityId !== null ||
        row.expenseId !== null ||
        row.sourceSubmissionId !== null ||
        !row.storageReady ||
        row.status === 'REJECTED' ||
        row.publicVisibilityStatus !== 'PRIVATE'
      )
        throw new ConflictException(
          'Only ready beneficiary photos and videos can be sent for public review.',
        )
      return this.queue(tx, actor, projectId, row.id, { ...unlinked, storageReady: true })
    })
  }

  /** Approves a queued row for someone other than its uploader and its queue sender. */
  approve(identity: ApplicationIdentity, requestedProjectId: string, mediaId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'public.approve', async (tx, actor) => {
      const { projectId, row } = await this.requireMedia(tx, actor, requestedProjectId, mediaId)
      if (
        row.publicVisibilityStatus !== 'FOR_REVIEW' ||
        row.status === 'REJECTED' ||
        !row.storageReady
      )
        throw new ConflictException('This media is not awaiting public approval.')
      if (actor.userId === row.publicSubmittedById || actor.userId === row.submittedById)
        throw new ForbiddenException('A different reviewer must approve this media.')
      const moved = await tx.evidenceMedia.updateMany({
        where: {
          id: row.id,
          organizationId: actor.organizationId,
          projectId,
          publicVisibilityStatus: 'FOR_REVIEW',
          status: { not: 'REJECTED' },
        },
        data: {
          publicVisibilityStatus: 'APPROVED',
          publicApprovedById: actor.userId,
          publicApprovedAt: new Date(),
        },
      })
      if (moved.count !== 1) throw new ConflictException('Media changed. Reload and retry.')
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'PUBLIC_MEDIA_APPROVED',
        entityType: 'EvidenceMedia',
        entityId: row.id,
        changes: {},
      })
      return { mediaId: row.id, publicStatus: 'APPROVED' as const }
    })
  }

  /** Rejects a queued or approved row; it keeps its public status and stops being pickable. */
  async reject(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    input: unknown,
  ) {
    const parsed = publicMediaRejectRequest.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('A rejection reason of 1 to 2000 characters is required.')
    return withAuthorizedOperation(this.prisma, identity, 'public.approve', async (tx, actor) => {
      const { projectId, row } = await this.requireMedia(tx, actor, requestedProjectId, mediaId)
      if (row.publicVisibilityStatus === 'PRIVATE' || row.status !== 'PENDING')
        throw new ConflictException('This media is not in the public queue.')
      if (actor.userId === row.submittedById)
        throw new ForbiddenException('A different reviewer must reject this media.')
      const moved = await tx.evidenceMedia.updateMany({
        where: {
          id: row.id,
          organizationId: actor.organizationId,
          projectId,
          publicVisibilityStatus: { in: ['FOR_REVIEW', 'APPROVED'] },
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          rejectedById: actor.userId,
          rejectedAt: new Date(),
          rejectionReason: parsed.data.reason,
        },
      })
      if (moved.count !== 1) throw new ConflictException('Media changed. Reload and retry.')
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'PUBLIC_MEDIA_REJECTED',
        entityType: 'EvidenceMedia',
        entityId: row.id,
        changes: { reason: parsed.data.reason },
      })
      return { mediaId: row.id, status: 'REJECTED' as const }
    })
  }

  /** Streams a verified file; the stream withholds its last bytes unless size and digest still match. */
  async content(identity: ApplicationIdentity, requestedProjectId: string, mediaId: string) {
    const target = await withAuthorizedOperation(
      this.prisma,
      identity,
      'public.preview',
      async (tx, actor) => {
        requireEvidenceRead(actor)
        const found = await this.requireMedia(tx, actor, requestedProjectId, mediaId, listed)
        return { ...found, organizationId: actor.organizationId }
      },
    )
    const { row } = target
    try {
      const streamer = this.storageFactories.createPrivateObjectStreamer({
        serviceOrigin: this.env.SUPABASE_URL ?? '',
        serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        evidenceBucket: this.env.EVIDENCE_BUCKET,
        maxBytes: this.env.EVIDENCE_MAX_FILE_BYTES,
        storageDeadlineMs: PROOF_STORAGE_DEADLINE_MS,
      })
      const byteSize = Number(row.byteSize)
      const body = await streamer.release({
        organizationId: target.organizationId,
        projectId: target.projectId,
        evidenceId: row.id,
        bucket: row.bucket,
        objectKey: row.objectKey,
        expectedBytes: byteSize,
        expectedSha256: row.sha256,
        signal: new AbortController().signal,
        deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
      })
      return { body, byteSize, contentType: row.contentType }
    } catch {
      throw new ServiceUnavailableException('Media is temporarily unavailable.')
    }
  }
}
