import { randomUUID } from 'node:crypto'
import {
  proofClientAcknowledgement,
  readRuleSourceAcknowledgement,
} from '../rules/rules-source-operation'

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  type ActivityProofReservationResponse,
  type ActivityProofUploadLimitsResponse,
  MAX_ACTIVITY_EVIDENCE_FILES,
  type ReserveActivityProofRequest,
} from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { requireActiveAssignment, requireActivity } from './activity-access.service'
import {
  activityEvidenceLimits,
  activityEvidenceType,
  declarationKey,
  evidenceExtension,
  proofDeclarations,
  proofFinalizeBody,
} from './activity-proof.helpers'

// Publishes the upload limits and reserves the private evidence rows of one activity update.
@Injectable()
export class ActivityProofsService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** Effective upload limits for the web client; the same values bound every reservation. */
  proofUploadLimits(projectId: string): ActivityProofUploadLimitsResponse {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    return activityEvidenceLimits(this.env.EVIDENCE_MAX_FILE_BYTES)
  }

  /**
   * Reserves an activity update with 1-10 private evidence rows and returns one signed upload
   * URL per unverified row, each scoped to its server-derived object key. Authority is the
   * existing proof authority: activities.proof.submit, an active personal activity assignment
   * and no other pending update. A retry with the same clientUpdateId and identical
   * declarations returns the same reservation with fresh URLs; changed declarations conflict.
   */
  async reserveProof(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: ReserveActivityProofRequest,
  ): Promise<ActivityProofReservationResponse> {
    const declared = proofDeclarations(input.files, this.env.EVIDENCE_MAX_FILE_BYTES)
    const note = input.note.trim()
    if (!note) throw new BadRequestException('A progress note is required.')
    const clientUpdateId = input.clientUpdateId.toLowerCase()
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const activity = await requireActivity(tx, actor, projectId, activityId)
        await requireActiveAssignment(tx, actor, activity)
        const existing = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            clientUpdateId,
          },
          select: {
            id: true,
            projectId: true,
            activityId: true,
            progressPercent: true,
            note: true,
            status: true,
            beneficiariesReachedThisSession: true,
            evidenceMedia_update: {
              select: {
                id: true,
                fileName: true,
                sha256: true,
                contentType: true,
                byteSize: true,
                bucket: true,
                objectKey: true,
                storageReady: true,
              },
              orderBy: { id: 'asc' },
              take: MAX_ACTIVITY_EVIDENCE_FILES + 1,
            },
          },
        })
        if (existing) {
          const stored = existing.evidenceMedia_update.map(declarationKey).sort()
          const requested = declared.map(declarationKey).sort()
          if (
            existing.projectId !== activity.projectId ||
            existing.activityId !== activity.id ||
            existing.progressPercent !== input.progressPercent ||
            existing.note !== note ||
            (existing.beneficiariesReachedThisSession ?? null) !==
              (input.beneficiariesReachedThisSession ?? null) ||
            JSON.stringify(stored) !== JSON.stringify(requested)
          )
            throw new ConflictException('The activity update id was reused with different input.')
          const acknowledgement = await readRuleSourceAcknowledgement(
            tx,
            'ACTIVITY_PROOF_FINALIZE',
            activity.projectId,
            activity.id,
            { kind: 'PROOF_FINALIZE', id: existing.id, phase: 'FINALIZE' },
            proofFinalizeBody(existing.id, existing.progressPercent, note, declared),
          )
          if (acknowledgement)
            return {
              acknowledgement: proofClientAcknowledgement(
                acknowledgement,
                existing.id,
                clientUpdateId,
              ),
            }
          if (existing.status !== 'PENDING')
            throw new ConflictException('This activity update is no longer awaiting evidence.')
          return { updateId: existing.id, evidence: existing.evidenceMedia_update }
        }
        if (activity.status !== 'IN_PROGRESS')
          throw new ConflictException('Evidence can be submitted only for an in-progress activity.')
        const pending = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: 'PENDING',
          },
          select: { id: true },
        })
        if (pending)
          throw new ConflictException('Another activity update is already awaiting review.')
        const updateId = randomUUID()
        await tx.activityUpdate.create({
          data: {
            id: updateId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            clientUpdateId,
            progressPercent: input.progressPercent,
            note,
            beneficiariesReachedThisSession: input.beneficiariesReachedThisSession ?? null,
            submittedById: actor.userId,
          },
        })
        const evidence = declared.map((file) => {
          const id = randomUUID()
          return {
            id,
            fileName: file.fileName,
            sha256: file.sha256,
            contentType: file.contentType,
            byteSize: BigInt(file.byteSize),
            bucket: this.env.EVIDENCE_BUCKET,
            objectKey: `organizations/${actor.organizationId}/projects/${activity.projectId}/evidence/${id}/proof${evidenceExtension[file.contentType]}`,
            storageReady: false,
          }
        })
        // One batched insert. The type follows the declared content type; finalize rejects a
        // file whose leading bytes do not match it, so a stored row never keeps a false type.
        await tx.evidenceMedia.createMany({
          data: evidence.map((row) => ({
            ...row,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            activityUpdateId: updateId,
            type: activityEvidenceType(row.contentType),
            description: note,
            submittedById: actor.userId,
          })),
        })
        return { updateId, evidence }
      },
    )
    if (reservation.acknowledgement)
      return {
        clientUpdateId,
        status: 'COMMITTED' as const,
        acknowledgement: reservation.acknowledgement,
      }
    const unverified = reservation.evidence.filter((row) => !row.storageReady)
    const urls = new Map<string, string>()
    if (unverified.length) {
      try {
        if (unverified.some((row) => row.bucket !== this.env.EVIDENCE_BUCKET))
          throw new Error('Unexpected evidence bucket')
        const signed = await this.storage.createPrivateUploadUrls(
          this.env.EVIDENCE_BUCKET,
          unverified.map((row) => row.objectKey),
        )
        unverified.forEach((row, index) => {
          if (signed[index]?.path !== row.objectKey) throw new Error('Unexpected upload URL')
          // An already stored object gets no URL; finalize verifies its exact bytes.
          const uploadUrl = signed[index].uploadUrl
          if (uploadUrl) urls.set(row.id, uploadUrl)
        })
      } catch {
        throw new ServiceUnavailableException(
          'Evidence upload could not be prepared. Retry the same update.',
        )
      }
    }
    return {
      clientUpdateId,
      updateId: reservation.updateId,
      status: unverified.length ? ('UPLOADING' as const) : ('READY_TO_COMMIT' as const),
      files: reservation.evidence.map((row) => ({
        evidenceId: row.id,
        fileName: row.fileName,
        contentType: row.contentType,
        byteSize: Number(row.byteSize),
        sha256: row.sha256,
        storageReady: row.storageReady,
        uploadUrl: urls.get(row.id) ?? null,
      })),
    }
  }
}
