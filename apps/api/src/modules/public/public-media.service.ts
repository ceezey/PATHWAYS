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
  MAX_BENEFICIARY_MEDIA_FILES,
  MAX_PUBLIC_MEDIA_LISTED,
  type PublicMediaListResponse,
  type ReservePublicMediaRequest,
  aggregateOnlyRoles,
  hasAtomicPermission,
  publicMediaContentTypes,
  publicMediaRejectRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import {
  type ApplicationIdentity,
  UUID_PATTERN,
  type VerifiedAuthIdentity,
} from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  activityEvidenceType,
  evidenceExtension,
  proofDeclarations,
} from '../activities/activity-proof.helpers'
import { BeneficiaryStepUpService } from '../auth/beneficiary-step-up.service'
import { streamVerifiedMedia, verifyUploadedMedia } from '../activities/private-media-access'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'

const unavailable = () => new NotFoundException('Public media unavailable.')
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

/** The verified session the auth guard attached, read for the beneficiary step-up check. */
export type StepUpSession = { auth?: VerifiedAuthIdentity; sessionId?: string }

/** An enrollment-linked row was read without a fresh step-up; it passes the operation boundary as a 403. */
class StepUpNeeded extends ForbiddenException {}

/** Enrollment-linked media keeps the beneficiary module's gates: records.read and no aggregate-only role. */
const canSeeBeneficiaryMedia = (actor: ApplicationIdentity) =>
  !aggregateOnlyRoles.includes(actor.roles[0]) &&
  hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')

@Injectable()
export class PublicMediaService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
    @Inject(BeneficiaryStepUpService) private readonly stepUp: BeneficiaryStepUpService,
  ) {}

  /** The beneficiary step-up arguments for one handler, as the auth guard passes them. */
  private stepUpArgs(
    identity: ApplicationIdentity,
    session: StepUpSession,
    projectId: string,
    handler: string,
  ) {
    return [
      session.auth ?? identity,
      identity,
      `PublicMediaController.${handler}`,
      projectId,
      session.sessionId ?? '',
    ] as const
  }

  /** Runs the work without step-up, and again after a fresh step-up only when it read an enrollment-linked row. */
  private async withStepUp<T>(
    identity: ApplicationIdentity,
    session: StepUpSession,
    projectId: string,
    handler: string,
    work: (steppedUp: boolean) => Promise<T>,
  ) {
    try {
      return await work(false)
    } catch (error) {
      if (!(error instanceof StepUpNeeded)) throw error
    }
    await this.stepUp.enforce(...this.stepUpArgs(identity, session, projectId, handler))
    return work(true)
  }

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
    steppedUp = false,
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
    if (row.enrollmentId !== null && !canSeeBeneficiaryMedia(actor))
      throw new ForbiddenException('Beneficiary media access is required.')
    if (row.enrollmentId !== null && !steppedUp) throw new StepUpNeeded()
    return { projectId, row }
  }

  /** Queued rows first so none falls off the cap; enrollment-linked rows also need a fresh step-up. */
  async list(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    session: StepUpSession = {},
  ) {
    // Checked before the read only for an actor who could see beneficiary rows at all.
    const fresh =
      canSeeBeneficiaryMedia(identity) &&
      hasAtomicPermission(identity.roles[0], identity.permissions, 'evidence.read') &&
      (await this.stepUp.isFresh(...this.stepUpArgs(identity, session, requestedProjectId, 'list')))
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      requireEvidenceRead(actor)
      const projectId = await requireScopedProject(tx, actor, requestedProjectId)
      const scoped = { ...listed, organizationId: actor.organizationId, projectId }
      const beneficiary = canSeeBeneficiaryMedia(actor)
      const where = { ...scoped, ...(beneficiary && fresh ? {} : { enrollmentId: null }) }
      const inQueue = { publicVisibilityStatus: 'FOR_REVIEW', status: { not: 'REJECTED' } } as const
      const select = {
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
      } satisfies Prisma.EvidenceMediaSelect
      const queued = await tx.evidenceMedia.findMany({
        where: { ...where, ...inQueue },
        select,
        orderBy: [{ publicSubmittedAt: 'desc' }, { id: 'asc' }],
        take: MAX_PUBLIC_MEDIA_LISTED,
      })
      const rest = await tx.evidenceMedia.findMany({
        where: { ...where, NOT: inQueue },
        select,
        orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
        take: MAX_PUBLIC_MEDIA_LISTED - queued.length,
      })
      // True only when beneficiary rows exist that this actor could see after a step-up.
      const beneficiaryMediaNeedsStepUp =
        beneficiary &&
        !fresh &&
        (await tx.evidenceMedia.findFirst({
          where: { ...scoped, enrollmentId: { not: null } },
          select: { id: true },
        })) !== null
      return {
        beneficiaryMediaNeedsStepUp,
        items: [...queued, ...rest].map((row) => ({
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
    await verifyUploadedMedia(this.env, this.storage, this.storageFactories, {
      organizationId: initial.organizationId,
      projectId: initial.projectId,
      row,
    })
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
  submit(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    session: StepUpSession = {},
  ) {
    return this.withStepUp(identity, session, requestedProjectId, 'submit', (steppedUp) =>
      withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
        const { projectId, row } = await this.requireMedia(
          tx,
          actor,
          requestedProjectId,
          mediaId,
          {},
          steppedUp,
        )
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
      }),
    )
  }

  /** Approves a queued row for someone other than its uploader and its queue sender. */
  approve(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    session: StepUpSession = {},
  ) {
    return this.withStepUp(identity, session, requestedProjectId, 'approve', (steppedUp) =>
      withAuthorizedOperation(this.prisma, identity, 'public.approve', async (tx, actor) => {
        const { projectId, row } = await this.requireMedia(
          tx,
          actor,
          requestedProjectId,
          mediaId,
          {},
          steppedUp,
        )
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
      }),
    )
  }

  /** Rejects a queued or approved row; it keeps its public status and stops being pickable. */
  async reject(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    input: unknown,
    session: StepUpSession = {},
  ) {
    const parsed = publicMediaRejectRequest.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException('A rejection reason of 1 to 2000 characters is required.')
    return this.withStepUp(identity, session, requestedProjectId, 'reject', (steppedUp) =>
      withAuthorizedOperation(this.prisma, identity, 'public.approve', async (tx, actor) => {
        const { projectId, row } = await this.requireMedia(
          tx,
          actor,
          requestedProjectId,
          mediaId,
          {},
          steppedUp,
        )
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
      }),
    )
  }

  /** Streams a verified file; the stream withholds its last bytes unless size and digest still match. */
  async content(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    mediaId: string,
    session: StepUpSession = {},
  ) {
    const target = await this.withStepUp(
      identity,
      session,
      requestedProjectId,
      'content',
      (steppedUp) =>
        withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
          requireEvidenceRead(actor)
          const found = await this.requireMedia(
            tx,
            actor,
            requestedProjectId,
            mediaId,
            listed,
            steppedUp,
          )
          return { ...found, organizationId: actor.organizationId }
        }),
    )
    return streamVerifiedMedia(this.env, this.storageFactories, target)
  }
}
