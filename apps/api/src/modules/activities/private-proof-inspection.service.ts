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
import { inspectionIdentityContext } from '../../common/network/inspection-request-budget'
import { PrismaService } from '../../prisma/prisma.service'
import { readApplicationProfile } from '../auth/application-profile.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import { createPrivateObjectStreamer } from '../storage/private-inspection-reader'
import { PROOF_STORAGE_DEADLINE_MS } from './activities.dto'

// cr-pathways-activity-progress-media 3.5: at most ten proofs per update, discovery bounded to
// eleven, every activity-update evidence type, and the configured per-file byte bound.
const MAX_PROOFS = 10
const activityProofTypes = ['PROGRESS_PROOF', 'COMPLETION_PROOF', 'PHOTO', 'VIDEO', 'DOCUMENT']

const unavailable = () => new NotFoundException('Activity proof unavailable.')
const stale = () => new ConflictException('Activity proof changed. Reload before inspecting.')
const revisionKeys = [
  'expectedActivityUpdatedAt',
  'expectedUpdateUpdatedAt',
  'expectedEvidenceUpdatedAt',
] as const
export type InspectionRevisions = Record<(typeof revisionKeys)[number], string>
const isoMilliseconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
export function inspectionRevisions(query: unknown): InspectionRevisions {
  if (!query || typeof query !== 'object' || Array.isArray(query))
    throw new BadRequestException('Invalid inspection revisions.')
  const values = query as Record<string, unknown>
  if (
    Object.keys(values).length !== 3 ||
    Object.keys(values).some((key) => !revisionKeys.includes(key as (typeof revisionKeys)[number]))
  )
    throw new BadRequestException('Invalid inspection revisions.')
  for (const key of revisionKeys) {
    const value = values[key]
    if (
      typeof value !== 'string' ||
      !isoMilliseconds.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      throw new BadRequestException('Invalid inspection revisions.')
  }
  return values as InspectionRevisions
}
const proofSelection = {
  id: true,
  organizationId: true,
  projectId: true,
  activityId: true,
  activityUpdateId: true,
  enrollmentId: true,
  expenseId: true,
  sourceSubmissionId: true,
  type: true,
  status: true,
  submittedById: true,
  storageReady: true,
  publicVisibilityStatus: true,
  updatedAt: true,
  bucket: true,
  objectKey: true,
  byteSize: true,
  sha256: true,
} satisfies Prisma.EvidenceMediaSelect
type Proof = Prisma.EvidenceMediaGetPayload<{ select: typeof proofSelection }>
type Scope = { projectId: string; activityId: string; updateId: string }
type Admission = Scope & {
  organizationId: string
  activityRevision: string
  updateRevision: string
  proofs: Proof[]
}

@Injectable()
export class PrivateProofInspectionService {
  private readonly env = readApiEnv(process.env)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private validateScope(scope: Scope, evidenceId?: string) {
    if (
      ![...Object.values(scope), ...(evidenceId === undefined ? [] : [evidenceId])].every((id) =>
        UUID_PATTERN.test(id),
      )
    )
      throw new BadRequestException('Invalid inspection identifiers.')
  }

  private async admission(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    scope: Scope,
  ): Promise<Admission> {
    if (
      actor.roles.length !== 1 ||
      actor.roles[0] !== 'MONITORING_AND_EVALUATION_OFFICER' ||
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.read') ||
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.review')
    )
      throw new ForbiddenException('Private inspection is unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: scope.projectId }] },
      select: { id: true },
    })
    if (!project) throw unavailable()
    const activity = await tx.projectActivity.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: project.id,
        id: scope.activityId,
        archivedAt: null,
      },
      select: { id: true, status: true, updatedAt: true },
    })
    if (!activity || activity.status !== 'FOR_REVIEW') throw unavailable()
    const update = await tx.activityUpdate.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: project.id,
        activityId: activity.id,
        id: scope.updateId,
      },
      select: { id: true, status: true, submittedById: true, updatedAt: true },
    })
    if (!update || update.status !== 'PENDING' || update.submittedById === actor.userId)
      throw unavailable()
    const proofs = await tx.evidenceMedia.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: project.id,
        activityId: activity.id,
        activityUpdateId: update.id,
      },
      select: proofSelection,
      orderBy: { id: 'asc' },
      take: MAX_PROOFS + 1,
    })
    if (proofs.length > MAX_PROOFS) throw stale()
    if (
      proofs.some(
        (proof) =>
          !proof.storageReady ||
          proof.status !== 'PENDING' ||
          proof.publicVisibilityStatus !== 'PRIVATE' ||
          proof.submittedById !== update.submittedById ||
          proof.submittedById === actor.userId ||
          !activityProofTypes.includes(proof.type) ||
          proof.enrollmentId !== null ||
          proof.expenseId !== null ||
          proof.sourceSubmissionId !== null ||
          proof.byteSize < 1n ||
          proof.byteSize > BigInt(this.env.EVIDENCE_MAX_FILE_BYTES) ||
          !/^[a-f0-9]{64}$/i.test(proof.sha256),
      )
    )
      throw unavailable()
    return {
      ...scope,
      organizationId: actor.organizationId,
      activityRevision: activity.updatedAt.toISOString(),
      updateRevision: update.updatedAt.toISOString(),
      proofs,
    }
  }

  context(identity: ApplicationIdentity, projectId: string, activityId: string, updateId: string) {
    const scope = {
      projectId: projectId.toLowerCase(),
      activityId: activityId.toLowerCase(),
      updateId: updateId.toLowerCase(),
    }
    this.validateScope(scope)
    return withAuthorizedOperation(this.prisma, identity, 'evidence.review', async (tx, actor) => {
      const current = await this.admission(tx, actor, scope)
      return {
        activityId: current.activityId,
        updateId: current.updateId,
        expectedActivityUpdatedAt: current.activityRevision,
        expectedUpdateUpdatedAt: current.updateRevision,
        proofs: current.proofs.map((proof) => ({
          id: proof.id,
          label: 'Activity proof' as const,
          expectedEvidenceUpdatedAt: proof.updatedAt.toISOString(),
        })),
      }
    })
  }

  async inspect(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    requestedEvidenceId: string,
    revisions: InspectionRevisions,
  ) {
    const scope = {
      projectId: projectId.toLowerCase(),
      activityId: activityId.toLowerCase(),
      updateId: updateId.toLowerCase(),
    }
    const evidenceId = requestedEvidenceId.toLowerCase()
    this.validateScope(scope, evidenceId)
    const inspection = inspectionIdentityContext(identity)
    if (!inspection)
      throw new ServiceUnavailableException('Private inspection is temporarily unavailable.')
    const budget = inspection.budget
    budget.check()
    const find = (admission: Admission) => {
      const proof = admission.proofs.find((entry) => entry.id === evidenceId)
      if (!proof) throw unavailable()
      if (
        admission.activityRevision !== revisions.expectedActivityUpdatedAt ||
        admission.updateRevision !== revisions.expectedUpdateUpdatedAt ||
        proof.updatedAt.toISOString() !== revisions.expectedEvidenceUpdatedAt
      )
        throw stale()
      return proof
    }
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'evidence.review',
      async (tx, actor) => {
        const admission = await this.admission(tx, actor, scope)
        return { admission, proof: find(admission) }
      },
    )
    let storage: ReturnType<typeof createPrivateObjectStreamer>
    const object = {
      organizationId: initial.admission.organizationId,
      ...scope,
      evidenceId,
      bucket: initial.proof.bucket,
      objectKey: initial.proof.objectKey,
      expectedBytes: Number(initial.proof.byteSize),
      expectedSha256: initial.proof.sha256,
      signal: budget.signal,
      deadlineMonotonicMs: budget.deadline,
    }
    // First pass: counted size and digest over the whole object; nothing is retained.
    try {
      storage = createPrivateObjectStreamer({
        serviceOrigin: this.env.SUPABASE_URL ?? '',
        serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        evidenceBucket: this.env.EVIDENCE_BUCKET,
        maxBytes: this.env.EVIDENCE_MAX_FILE_BYTES,
        storageDeadlineMs: PROOF_STORAGE_DEADLINE_MS,
      })
      await storage.verify(object)
    } catch {
      throw new ServiceUnavailableException('Private inspection is temporarily unavailable.')
    }
    budget.check()
    await withAuthorizedOperation(this.prisma, identity, 'evidence.review', async (tx, actor) => {
      // Stabilize pending rows through final recheck and audit commit. Ordinary
      // scoped runtime locks; no definer bypass or caller-supplied SQL.
      await tx.$queryRaw`SELECT id FROM pathways.project_activities
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${scope.projectId}::uuid
          AND id=${scope.activityId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM pathways.activity_updates
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${scope.projectId}::uuid
          AND activity_id=${scope.activityId}::uuid AND id=${scope.updateId}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM pathways.evidence_media
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${scope.projectId}::uuid
          AND activity_id=${scope.activityId}::uuid AND activity_update_id=${scope.updateId}::uuid
        ORDER BY id LIMIT 11 FOR SHARE`
      const live = await tx.$queryRaw<
        Array<{ live: boolean }>
      >`SELECT pathways.runtime_auth_session_live(
        ${identity.id}::uuid, ${inspection.sessionId}::uuid) AS live`
      if (live.length !== 1 || live[0]?.live !== true)
        throw new ForbiddenException('Private inspection is unavailable.')
      const fresh = await readApplicationProfile(
        tx,
        identity.id,
        identity.organizationId,
        identity.userId,
      )
      const current = await this.admission(tx, fresh, scope)
      const proof = find(current)
      if (
        current.organizationId !== initial.admission.organizationId ||
        proof.bucket !== initial.proof.bucket ||
        proof.objectKey !== initial.proof.objectKey ||
        proof.byteSize !== initial.proof.byteSize ||
        proof.sha256 !== initial.proof.sha256
      )
        throw stale()
      budget.check()
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: scope.projectId,
          action: 'EVIDENCE_PRIVATE_INSPECTION_AUTHORIZED',
          entityType: 'EvidenceMedia',
          entityId: evidenceId,
          changes: {
            purpose: 'EVIDENCE_VERIFICATION',
            activityId: scope.activityId,
            updateId: scope.updateId,
            ...revisions,
          },
        },
      })
      budget.check()
    })
    budget.check()
    // Second pass, only after final authorization and audit: the counted, digest-checked
    // stream that is released. It withholds its final bytes unless the object still verifies.
    try {
      return { body: await storage.release(object), byteSize: object.expectedBytes }
    } catch {
      throw new ServiceUnavailableException('Private inspection is temporarily unavailable.')
    }
  }
}
