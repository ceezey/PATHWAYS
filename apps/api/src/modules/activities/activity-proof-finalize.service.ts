import { performance } from 'node:perf_hooks'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  proofClientAcknowledgement,
  readRuleSourceAcknowledgement,
} from '../rules/rules-source-operation'

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import { type ActivityProofFinalizeResponse, MAX_ACTIVITY_EVIDENCE_FILES } from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import type { UploadVerification } from '../storage/private-inspection-reader'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'
import {
  readScopedActivity,
  requireActiveAssignment,
  requireActivity,
} from './activity-access.service'
import { mapWithMetrics } from './activity-metrics.service'
import {
  PROOF_STORAGE_DEADLINE_MS,
  proofFinalizeBody,
  verificationFailure,
} from './activity-proof.helpers'

// Verifies one uploaded evidence object and commits the update for review once every file is ready.
@Injectable()
export class ActivityProofFinalizeService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}

  /**
   * Verifies one directly uploaded evidence object outside any transaction (stored size,
   * leading bytes against the declared type, counted streamed SHA-256), marks it ready, and
   * when every file of the update is ready commits the update for review through the existing
   * ACTIVITY_PROOF_FINALIZE operation. A mismatch returns 422, deletes the unverified object
   * (best effort) and leaves the row unready, so the same update can retry.
   */
  async finalizeProofFile(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    evidenceId: string,
  ): Promise<ActivityProofFinalizeResponse> {
    if (![projectId, activityId, updateId, evidenceId].every((id) => UUID_PATTERN.test(id)))
      throw new NotFoundException('Activity evidence unavailable.')
    const scope = { updateId: updateId.toLowerCase(), evidenceId: evidenceId.toLowerCase() }
    const readTarget = async (tx: Tx, actor: ApplicationIdentity) => {
      const activity = await requireActivity(tx, actor, projectId, activityId)
      await requireActiveAssignment(tx, actor, activity)
      const row = await tx.evidenceMedia.findFirst({
        where: {
          id: scope.evidenceId,
          organizationId: actor.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
          activityUpdateId: scope.updateId,
          submittedById: actor.userId,
          activityUpdate: { submittedById: actor.userId },
        },
        select: {
          id: true,
          bucket: true,
          objectKey: true,
          byteSize: true,
          sha256: true,
          contentType: true,
          storageReady: true,
          activityUpdate: { select: { status: true } },
        },
      })
      if (!row) throw new NotFoundException('Activity evidence unavailable.')
      return { activity, row }
    }
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => ({
        ...(await readTarget(tx, actor)),
        organizationId: actor.organizationId,
      }),
    )
    let verified = false
    if (initial.row.activityUpdate?.status === 'PENDING' && !initial.row.storageReady) {
      const row = initial.row
      const byteSize = Number(row.byteSize)
      if (!Number.isSafeInteger(byteSize) || byteSize > this.env.EVIDENCE_MAX_FILE_BYTES)
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: 'PROOF_FILE_TOO_LARGE',
          message: 'The evidence file exceeds the current per-file limit.',
        })
      let outcome: UploadVerification
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
          projectId: initial.activity.projectId,
          evidenceId: row.id,
          bucket: row.bucket,
          objectKey: row.objectKey,
          expectedBytes: byteSize,
          expectedSha256: row.sha256,
          contentType: row.contentType ?? '',
          signal: new AbortController().signal,
          deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
        })
      } catch {
        throw new ServiceUnavailableException(
          'Evidence verification is temporarily unavailable. Retry finalizing this file.',
        )
      }
      if (outcome !== 'VERIFIED') {
        if (outcome !== 'OBJECT_MISSING')
          await this.storage.deleteFile(row.bucket, row.objectKey).catch(() => undefined)
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: `PROOF_${outcome}`,
          message: verificationFailure[outcome],
        })
      }
      verified = true
    }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const { activity, row } = await readTarget(tx, actor)
        // Serialize finalizes of one update so exactly one of them observes the last ready file.
        // The submitter has no UPDATE row policy on activity_updates, so the row lock below locks
        // nothing for them; the advisory transaction lock keyed to the update is policy-free.
        await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`proof-finalize:${scope.updateId}`},0))`
        await tx.$queryRaw`SELECT id FROM pathways.activity_updates WHERE organization_id=${actor.organizationId}::uuid
          AND project_id=${activity.projectId}::uuid AND activity_id=${activity.id}::uuid
          AND id=${scope.updateId}::uuid FOR UPDATE`
        const update = await tx.activityUpdate.findFirst({
          where: {
            id: scope.updateId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            submittedById: actor.userId,
          },
          select: {
            id: true,
            clientUpdateId: true,
            status: true,
            progressPercent: true,
            note: true,
            evidenceMedia_update: {
              select: {
                id: true,
                fileName: true,
                sha256: true,
                contentType: true,
                byteSize: true,
                storageReady: true,
              },
              orderBy: { id: 'asc' },
              take: MAX_ACTIVITY_EVIDENCE_FILES + 1,
            },
          },
        })
        if (!update) throw new NotFoundException('Activity evidence unavailable.')
        const files = update.evidenceMedia_update
        const body = proofFinalizeBody(update.id, update.progressPercent, update.note ?? '', files)
        const committed = (value: unknown) => ({
          status: 'COMMITTED' as const,
          acknowledgement: proofClientAcknowledgement(value, update.id, update.clientUpdateId),
        })
        if (update.status !== 'PENDING') {
          const acknowledgement = await readRuleSourceAcknowledgement(
            tx,
            'ACTIVITY_PROOF_FINALIZE',
            activity.projectId,
            activity.id,
            { kind: 'PROOF_FINALIZE', id: update.id, phase: 'FINALIZE' },
            body,
          )
          if (!acknowledgement)
            throw new ConflictException('This activity update is no longer awaiting evidence.')
          return committed(acknowledgement)
        }
        if (!row.storageReady) {
          if (!verified)
            throw new ConflictException('Activity evidence changed. Retry finalizing this file.')
          const marked = await tx.evidenceMedia.updateMany({
            where: {
              id: row.id,
              organizationId: actor.organizationId,
              activityUpdateId: update.id,
              submittedById: actor.userId,
              storageReady: false,
            },
            data: { storageReady: true },
          })
          if (marked.count !== 1)
            throw new ConflictException('Activity evidence changed. Retry finalizing this file.')
        }
        const remaining = files.filter((file) => !file.storageReady && file.id !== row.id).length
        if (remaining > 0) return { status: 'UPLOADING' as const, updateId: update.id, remaining }
        const source = await beginRuleSourceOperation(
          tx,
          'ACTIVITY_PROOF_FINALIZE',
          activity.projectId,
          activity.id,
          { kind: 'PROOF_FINALIZE', id: update.id, phase: 'FINALIZE' },
          body,
        )
        if (source.kind === 'REPLAY') return committed(source.acknowledgement)
        const current = await requireActivity(tx, actor, activity.projectId, activity.id)
        if (current.status !== 'IN_PROGRESS' && current.status !== 'FOR_REVIEW')
          throw new ConflictException('The activity can no longer enter review.')
        await tx.projectActivity.update({
          where: { id: current.id },
          data: {
            status: 'FOR_REVIEW',
            progressPercent: update.progressPercent,
            updatedAt: new Date(source.generatedValues.timestamp),
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_UPDATE_SUBMITTED',
          entityType: 'ActivityUpdate',
          entityId: update.id,
          changes: { progressPercent: update.progressPercent, proofCount: files.length },
        })
        const internalAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          update.id,
        )
        const sourceAcknowledgement = proofClientAcknowledgement(
          internalAcknowledgement,
          update.id,
          update.clientUpdateId,
        )
        const result = await mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, activity.projectId, activity.id),
          this.env.BUSINESS_TIME_ZONE,
        )
        return { status: 'COMMITTED' as const, activity: { ...result, sourceAcknowledgement } }
      },
    )
  }
}
