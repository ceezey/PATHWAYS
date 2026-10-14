import { randomUUID } from 'node:crypto'
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'

import { type SaveJourneyStagesRequest, hasAtomicPermission } from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { mapStage, stageSelection } from './journey-stages.mapper'

// Reads and saves a project's journey stages and their activity mappings.
@Injectable()
export class JourneyStagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listStages(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'journeys.read',
      async (tx, actor) => {
        const id = await requireScopedProject(tx, actor, projectId)
        const stages = await tx.journeyStage.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
          select: stageSelection,
          orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
          take: 100,
        })
        return stages.map(mapStage)
      },
      { alsoAllow: ['journeys.manage'] },
    )
  }

  saveStages(identity: ApplicationIdentity, projectId: string, input: SaveJourneyStagesRequest) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'journeys.manage',
      async (tx, actor) => {
        const id = await requireScopedProject(tx, actor, projectId)
        await tx.$queryRaw`SELECT id FROM pathways.projects WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`
        const current = await tx.journeyStage.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
          select: stageSelection,
          orderBy: { id: 'asc' },
          take: 100,
        })
        const inUse = hasAtomicPermission(
          actor.roles[0],
          actor.permissions,
          'beneficiaries.records.read',
        )
          ? await tx.beneficiaryJourneyEvent.count({
              where: { organizationId: actor.organizationId, projectId: id },
            })
          : (
              await tx.$queryRaw<Array<{ inUse: boolean }>>`
            SELECT pathways.p10_journey_has_events(${id}::uuid) AS "inUse"
          `
            )[0].inUse
        const ids = input.stages.map((stage) => stage.id ?? randomUUID())
        if (
          new Set(ids).size !== ids.length ||
          new Set(input.stages.map((stage) => stage.code)).size !== input.stages.length ||
          new Set(input.stages.map((stage) => stage.order)).size !== input.stages.length
        ) {
          throw new ConflictException('Stage identifiers, codes, and order values must be unique.')
        }
        const knownIds = new Set(ids)
        for (const [index, stage] of input.stages.entries()) {
          if (
            stage.parentStageId &&
            (!knownIds.has(stage.parentStageId) || stage.parentStageId === ids[index])
          ) {
            throw new ConflictException(
              'Every parent stage must be another stage in this project configuration.',
            )
          }
          const parent = stage.parentStageId ? input.stages[ids.indexOf(stage.parentStageId)] : null
          if (parent && (parent.order >= stage.order || parent.terminal)) {
            throw new ConflictException(
              'A parent stage must precede its child and cannot be terminal.',
            )
          }
        }
        const activityIds = [
          ...new Set(
            input.stages
              .flatMap((stage) => stage.mappedActivityIds)
              .map((value) => value.toLowerCase()),
          ),
        ]
        if (activityIds.some((value) => !UUID_PATTERN.test(value)))
          throw new NotFoundException('Mapped activity unavailable.')
        const activities = await tx.projectActivity.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: id,
            id: { in: activityIds },
            archivedAt: null,
          },
          select: { id: true },
          take: 100,
        })
        if (activities.length !== activityIds.length)
          throw new NotFoundException('Mapped activity unavailable.')

        if (inUse) {
          const desired = input.stages
            .map((stage, index) => ({
              id: ids[index],
              code: stage.code,
              name: stage.name,
              order: stage.order,
              type: stage.type,
              parentStageId: stage.parentStageId ?? null,
              terminal: Boolean(stage.terminal),
              description: stage.description?.trim() || '',
              mappedActivityIds: [...stage.mappedActivityIds].sort(),
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
          const stored = current
            .map((stage) => ({
              id: stage.id,
              code: stage.code,
              name: stage.name,
              order: stage.stageOrder,
              type: stage.stageType,
              parentStageId: stage.parentStageId,
              terminal: stage.isTerminal,
              description: stage.description ?? '',
              mappedActivityIds: stage.activityJourneyStageMapping_stage
                .map((mapping) => mapping.activityId)
                .sort(),
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
          if (JSON.stringify(desired) !== JSON.stringify(stored))
            throw new ConflictException(
              'Journey configuration is frozen after its first recorded event.',
            )
          return current.map(mapStage)
        }

        for (const stage of current)
          await tx.journeyStage.update({ where: { id: stage.id }, data: { parentStageId: null } })
        // Archived rows still hold unique codes and orders, so park them past every live slot.
        const archived = await tx.journeyStage.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: { not: null } },
          select: { id: true, code: true, stageOrder: true },
          take: 1000,
        })
        const maxWanted = Math.max(0, ...input.stages.map((stage) => stage.order))
        let parking = Math.max(10000, maxWanted, ...archived.map((stage) => stage.stageOrder)) + 1
        const wantedCodes = new Set(input.stages.map((stage) => stage.code))
        for (const stage of archived) {
          const clashes = wantedCodes.has(stage.code)
          if (!clashes && stage.stageOrder > maxWanted) continue
          await tx.journeyStage.update({
            where: { id: stage.id },
            data: {
              stageOrder: parking++,
              ...(clashes ? { code: `${stage.code}~${stage.id.slice(0, 8)}` } : {}),
            },
          })
        }
        for (const stage of current)
          await tx.journeyStage.update({
            where: { id: stage.id },
            data: { stageOrder: parking++ },
          })
        const existingIds = new Set(current.map((stage) => stage.id))
        for (const [index, stage] of input.stages.entries()) {
          const stageId = ids[index]
          if (existingIds.has(stageId)) {
            const stored = current.find((item) => item.id === stageId)
            if (!stored) throw new ConflictException('Stage changed; reload before saving.')
            const expected = stage.expectedUpdatedAt ? new Date(stage.expectedUpdatedAt) : null
            if (!expected || expected.valueOf() !== stored.updatedAt.valueOf())
              throw new ConflictException('Stage changed; reload before saving.')
            await tx.journeyStage.update({
              where: { id: stageId },
              data: {
                code: stage.code,
                name: stage.name.trim(),
                stageOrder: stage.order,
                stageType: stage.type,
                isTerminal: Boolean(stage.terminal),
                description: stage.description?.trim() || null,
              },
            })
          } else {
            await tx.journeyStage.create({
              data: {
                id: stageId,
                organizationId: actor.organizationId,
                projectId: id,
                code: stage.code,
                name: stage.name.trim(),
                stageOrder: stage.order,
                stageType: stage.type,
                isTerminal: Boolean(stage.terminal),
                description: stage.description?.trim() || null,
                createdById: actor.userId,
              },
            })
          }
        }
        for (const [index, stage] of input.stages.entries())
          if (stage.parentStageId)
            await tx.journeyStage.update({
              where: { id: ids[index] },
              data: { parentStageId: stage.parentStageId },
            })
        const removed = current.filter((stage) => !knownIds.has(stage.id))
        for (const stage of removed)
          await tx.journeyStage.update({
            where: { id: stage.id },
            data: { archivedAt: new Date(), code: `${stage.code}~${stage.id.slice(0, 8)}` },
          })
        await tx.activityJourneyStageMapping.deleteMany({
          where: { organizationId: actor.organizationId, projectId: id },
        })
        const mappings = input.stages.flatMap((stage, stageIndex) =>
          stage.mappedActivityIds.map((activityId, sequenceOrder) => ({
            organizationId: actor.organizationId,
            projectId: id,
            activityId: activityId.toLowerCase(),
            stageId: ids[stageIndex],
            sequenceOrder: sequenceOrder + 1,
            createdById: actor.userId,
          })),
        )
        if (mappings.length) await tx.activityJourneyStageMapping.createMany({ data: mappings })
        await writeAuditLog(tx, actor, {
          projectId: id,
          action: 'JOURNEY_CONFIGURATION_SAVED',
          entityType: 'Project',
          entityId: id,
          changes: { stageCount: input.stages.length, mappingCount: mappings.length },
        })
        const result = await tx.journeyStage.findMany({
          where: { organizationId: actor.organizationId, projectId: id, archivedAt: null },
          select: stageSelection,
          orderBy: [{ stageOrder: 'asc' }, { id: 'asc' }],
          take: 100,
        })
        return result.map(mapStage)
      },
      // One write per stage step; cross-region latency outgrows the 5s default.
      { transactionTimeoutMs: 20_000 },
    )
  }
}
