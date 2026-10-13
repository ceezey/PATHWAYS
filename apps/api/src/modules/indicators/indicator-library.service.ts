import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  createIndicatorFromLibraryRequest,
  createIndicatorLibraryEntryRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  monitoringSqlError,
  parseIndicatorRequest,
  sameLibraryDefinition,
} from './indicators.helpers'
import { toLibraryEntryResponse } from './indicators.mapper'
import { IndicatorsService } from './indicators.service'

const MAX_ACTIVE_ENTRIES = 200

@Injectable()
export class IndicatorLibraryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,
  ) {}

  private readActive(tx: Tx, organizationId: string, id?: string) {
    return tx.indicatorLibraryEntry.findMany({
      where: { organizationId, archivedAt: null, ...(id ? { id } : {}) },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: MAX_ACTIVE_ENTRIES,
    })
  }

  list(identity: ApplicationIdentity) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.library.read',
      async (tx, actor) =>
        (await this.readActive(tx, actor.organizationId)).map(toLibraryEntryResponse),
    )
  }

  async create(identity: ApplicationIdentity, value: unknown) {
    const input = parseIndicatorRequest(createIndicatorLibraryEntryRequest, value)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.library.create',
      async (tx, actor) => {
        const where = { organizationId: actor.organizationId }
        const retry = await tx.indicatorLibraryEntry.findFirst({
          where: { ...where, clientMutationId: input.clientMutationId },
        })
        if (retry) {
          if (!sameLibraryDefinition(retry, input))
            throw new ConflictException('The request key was already used for a different entry.')
          return toLibraryEntryResponse(retry)
        }
        const active = await tx.indicatorLibraryEntry.count({
          where: { ...where, archivedAt: null },
        })
        if (active >= MAX_ACTIVE_ENTRIES)
          throw new ConflictException('Archive unused library entries before adding more than 200.')
        try {
          const row = await tx.indicatorLibraryEntry.create({
            data: {
              organizationId: actor.organizationId,
              code: input.code,
              name: input.name,
              description: input.description ?? null,
              unitLabel: input.unitLabel,
              dataSource: input.dataSource,
              measurementMode: input.mode,
              numericKind: input.numericKind,
              direction: input.direction,
              displayPrecision: input.displayPrecision,
              recipe: input.recipe ?? null,
              clientMutationId: input.clientMutationId,
              createdById: actor.userId,
            },
          })
          await writeAuditLog(tx, actor, {
            action: 'INDICATOR_LIBRARY_ENTRY_CREATED',
            entityType: 'IndicatorLibraryEntry',
            entityId: row.id,
            changes: { code: row.code },
          })
          return toLibraryEntryResponse(row)
        } catch (error) {
          return monitoringSqlError(error)
        }
      },
    )
  }

  async archive(identity: ApplicationIdentity, entryId: string) {
    if (!UUID_PATTERN.test(entryId)) throw new NotFoundException('Library entry unavailable.')
    const id = entryId.toLowerCase()
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.library.archive',
      async (tx, actor) => {
        const { count } = await tx.indicatorLibraryEntry.updateMany({
          where: { id, organizationId: actor.organizationId, archivedAt: null },
          data: { archivedAt: new Date() },
        })
        if (count !== 1) throw new NotFoundException('Library entry unavailable.')
        await writeAuditLog(tx, actor, {
          action: 'INDICATOR_LIBRARY_ENTRY_ARCHIVED',
          entityType: 'IndicatorLibraryEntry',
          entityId: id,
          changes: {},
        })
        return { id, archived: true }
      },
    )
  }

  /** Copies the definition into a project indicator; later library changes never touch it. */
  async createProjectIndicator(identity: ApplicationIdentity, projectId: string, value: unknown) {
    const { libraryEntryId, ...projectValues } = parseIndicatorRequest(
      createIndicatorFromLibraryRequest,
      value,
    )
    const [entry] = await withAuthorizedOperation(
      this.prisma,
      identity,
      'indicators.library.read',
      (tx, actor) => this.readActive(tx, actor.organizationId, libraryEntryId),
    )
    if (!entry) throw new NotFoundException('Library entry unavailable.')
    return this.indicators.create(identity, projectId, {
      ...projectValues,
      code: entry.code,
      name: entry.name,
      description: entry.description ?? undefined,
      unitLabel: entry.unitLabel,
      dataSource: entry.dataSource,
      mode: entry.measurementMode,
      numericKind: entry.numericKind,
      direction: entry.direction,
      displayPrecision: entry.displayPrecision,
      binding: entry.recipe ? { recipe: entry.recipe } : undefined,
    })
  }
}
