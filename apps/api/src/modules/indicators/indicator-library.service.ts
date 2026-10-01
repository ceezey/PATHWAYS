import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { CreateLibraryEntryInput, LibraryEntry, MetricRecipe } from '@pathways/shared'
import type { IndicatorLibraryEntry, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import {
  createLibraryEntrySchema,
  parseIndicatorInput,
  useLibraryEntrySchema,
} from './indicators.dto'
import { IndicatorsService, monitoringSqlError } from './indicators.service'

const MAX_ACTIVE_ENTRIES = 200

function toEntry(row: IndicatorLibraryEntry): LibraryEntry {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unitLabel: row.unitLabel,
    dataSource: row.dataSource,
    mode: row.measurementMode as LibraryEntry['mode'],
    numericKind: row.numericKind as LibraryEntry['numericKind'],
    direction: row.direction as LibraryEntry['direction'],
    displayPrecision: row.displayPrecision,
    recipe: row.recipe as MetricRecipe | null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Same key with the same definition replays; the same key with another definition conflicts. */
function sameDefinition(row: IndicatorLibraryEntry, input: CreateLibraryEntryInput) {
  return (
    row.code === input.code &&
    row.name === input.name &&
    row.description === (input.description ?? null) &&
    row.unitLabel === input.unitLabel &&
    row.dataSource === input.dataSource &&
    row.measurementMode === input.mode &&
    row.numericKind === input.numericKind &&
    row.direction === input.direction &&
    row.displayPrecision === input.displayPrecision &&
    row.recipe === (input.recipe ?? null)
  )
}

@Injectable()
export class IndicatorLibraryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IndicatorsService) private readonly indicators: IndicatorsService,
  ) {}

  private readActive(tx: Prisma.TransactionClient, organizationId: string, id?: string) {
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
      async (tx, actor) => (await this.readActive(tx, actor.organizationId)).map(toEntry),
    )
  }

  async create(identity: ApplicationIdentity, value: unknown) {
    const input = parseIndicatorInput(createLibraryEntrySchema, value)
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
          if (!sameDefinition(retry, input))
            throw new ConflictException('The request key was already used for a different entry.')
          return toEntry(retry)
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
          await this.audit(tx, actor, 'INDICATOR_LIBRARY_ENTRY_CREATED', row.id, {
            code: row.code,
          })
          return toEntry(row)
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
        await this.audit(tx, actor, 'INDICATOR_LIBRARY_ENTRY_ARCHIVED', id, {})
        return { id, archived: true }
      },
    )
  }

  /** Copies the definition into a project indicator; later library changes never touch it. */
  async createProjectIndicator(identity: ApplicationIdentity, projectId: string, value: unknown) {
    const { libraryEntryId, ...projectValues } = parseIndicatorInput(useLibraryEntrySchema, value)
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

  private audit(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    action: string,
    entityId: string,
    changes: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action,
        entityType: 'IndicatorLibraryEntry',
        entityId,
        changes,
      },
    })
  }
}
