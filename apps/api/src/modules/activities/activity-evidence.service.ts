import { createHash } from 'node:crypto'

import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import { type ActivityEvidenceListResponse, aggregateOnlyRoles } from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { reviewStatus } from './activities.helpers'
import { activitySelection } from './activities.mapper'

// Lists the evidence of one project and releases one stored proof file.
@Injectable()
export class ActivityEvidenceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** Evidence list under `evidence.read`. Aggregate-only roles receive per-activity
   * counts selected without file names, submitters, notes, or storage references. */
  listEvidence(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<ActivityEvidenceListResponse> {
    return withAuthorizedOperation(this.prisma, identity, 'evidence.read', async (tx, actor) => {
      const activityWhere = { organizationId: actor.organizationId, archivedAt: null }
      if (aggregateOnlyRoles.includes(actor.roles[0])) {
        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: activityWhere,
            select: { id: true, title: true },
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
        const activityIds = project.projectActivity_project.map((row) => row.id)
        // Counts come from the database, so they are exact rather than capped by row limits.
        const groups = activityIds.length
          ? await tx.evidenceMedia.groupBy({
              by: ['activityId', 'status'],
              where: {
                organizationId: actor.organizationId,
                projectId: projectId.toLowerCase(),
                activityId: { in: activityIds },
                activityUpdateId: { not: null },
                storageReady: true,
              },
              _count: { _all: true },
            })
          : []
        return {
          scope: 'aggregate' as const,
          activities: project.projectActivity_project.map((row) => {
            const counts = { total: 0, submitted: 0, approved: 0, returned: 0 }
            for (const group of groups) {
              if (group.activityId !== row.id) continue
              const count = group._count._all
              counts.total += count
              const status = reviewStatus[group.status]
              if (status === 'Accepted') counts.approved += count
              else if (status === 'Flagged') counts.returned += count
              else counts.submitted += count
            }
            return { activityId: row.id, activityTitle: row.title, ...counts }
          }),
        }
      }
      const project = await requireScopedProjectRow(tx, actor, projectId, {
        projectActivity_project: {
          where: activityWhere,
          select: {
            id: true,
            projectId: true,
            title: true,
            // Detail keeps the same bounded page as the activity list (100 activities,
            // 100 updates, 10 proofs per update); counts for totals use the aggregate path.
            activityUpdate_activity: {
              ...activitySelection.activityUpdate_activity,
              select: {
                ...activitySelection.activityUpdate_activity.select,
                evidenceMedia_update: {
                  ...activitySelection.activityUpdate_activity.select.evidenceMedia_update,
                  select: {
                    ...activitySelection.activityUpdate_activity.select.evidenceMedia_update.select,
                    contentType: true,
                    byteSize: true,
                    isIdentifying: true,
                  },
                },
              },
            },
          },
          orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
          take: 100,
        },
      })
      return {
        scope: 'detail' as const,
        records: project.projectActivity_project.flatMap((row) =>
          row.activityUpdate_activity.flatMap((update) =>
            update.evidenceMedia_update.map((proof) => {
              const status = reviewStatus[proof.status]
              return {
                id: proof.id,
                projectId: row.projectId,
                activityId: row.id,
                updateId: update.id,
                updateUpdatedAt: update.updatedAt.toISOString(),
                fileName: proof.fileName,
                reportTitle: row.title,
                status:
                  status === 'Accepted'
                    ? ('Approved' as const)
                    : status === 'Flagged'
                      ? ('Returned' as const)
                      : ('Submitted' as const),
                submitter: update.submittedBy.fullName,
                submittedDate: proof.submittedAt.toISOString(),
                contentType: proof.contentType,
                byteSize: Number(proof.byteSize),
                isIdentifying: proof.isIdentifying,
                reviewedDate: update.reviewedAt?.toISOString() ?? null,
                reviewer: update.reviewedBy?.fullName ?? null,
                previewSummary: update.note ?? 'Activity evidence submission',
              }
            }),
          ),
        ),
      }
    })
  }

  async downloadProof(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    evidenceId: string,
  ) {
    const metadata = await withAuthorizedOperation(
      this.prisma,
      identity,
      'evidence.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (!UUID_PATTERN.test(activityId) || !UUID_PATTERN.test(evidenceId))
          throw new NotFoundException('Proof unavailable.')
        const proof = await tx.evidenceMedia.findFirst({
          where: {
            id: evidenceId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: project.id,
            activityId: activityId.toLowerCase(),
            storageReady: true,
            activityUpdateId: { not: null },
          },
          select: {
            bucket: true,
            objectKey: true,
            fileName: true,
            contentType: true,
            sha256: true,
          },
        })
        if (!proof) throw new NotFoundException('Proof unavailable.')
        return proof
      },
    )
    const body = await this.storage.downloadPrivateFile(metadata.bucket, metadata.objectKey)
    // Bytes that no longer match the recorded digest are never released.
    if (createHash('sha256').update(body).digest('hex') !== metadata.sha256)
      throw new NotFoundException('Proof unavailable.')
    return { fileName: metadata.fileName, contentType: metadata.contentType, body }
  }
}
