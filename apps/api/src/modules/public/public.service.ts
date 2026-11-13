import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type PublicProjectResponse,
  type PublicationOperation,
  publicProjectResponse,
  publicationTransitionRequest,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'

type PublicationRow = {
  revision: number
  state: 'FOR_REVIEW' | 'APPROVED' | 'PUBLISHED'
  summary: string
  snapshot: Prisma.JsonValue
  liveRevision: number | null
  liveSnapshot: Prisma.JsonValue | null
  livePublishedAt: Date | null
  submittedById: string
  approvedById: string | null
  publishedById: string | null
  updatedAt: Date
}
// The publication guard's refusal of a chosen photo or video that is no longer pickable (0086 p85_publication_media).
const mediaNotPublishable = (error: unknown) => {
  const meta = (error as { meta?: { code?: unknown; message?: unknown } } | null)?.meta
  return (
    meta?.code === '23514' &&
    typeof meta.message === 'string' &&
    meta.message.includes('Media not publishable')
  )
}
const permissions = {
  SUBMIT: 'public.preview',
  APPROVE: 'public.approve',
  PUBLISH: 'public.publish',
  WITHDRAW: 'public.publish',
} as const
// The staff read drops the frozen pins, which only the anonymous map reads (0089), so the strict web schema still parses.
const rowSelection = Prisma.sql`revision,state,summary,snapshot - 'pins' AS snapshot,live_revision AS "liveRevision",live_snapshot - 'pins' AS "liveSnapshot",
 live_published_at AS "livePublishedAt",submitted_by_id::text AS "submittedById",
 approved_by_id::text AS "approvedById",published_by_id::text AS "publishedById",updated_at AS "updatedAt"`
const logger = new Logger('PublicService')

@Injectable()
export class PublicService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async published(projectId?: string, offset = 0, limit = 50) {
    if (projectId !== undefined && !z.guid().safeParse(projectId).success)
      throw new NotFoundException('Project unavailable.')
    const page = z
      .object({
        offset: z.number().int().min(0).max(10000),
        limit: z.number().int().min(1).max(100),
      })
      .safeParse({ offset, limit })
    if (!page.success) throw new BadRequestException('Invalid public page.')
    // This fixed entrypoint exposes only approved snapshots; no staff identity or source DTO is read.
    let projects: PublicProjectResponse[]
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ projects: unknown }>>`
        SELECT pathways.p85_public_projects(${projectId ?? null}::uuid,${offset}::integer,${limit}::integer) AS projects`
      projects = z.array(publicProjectResponse).max(100).parse(row?.projects)
    } catch {
      // Anonymous callers get a fixed outage response, never a database diagnostic.
      throw new ServiceUnavailableException('Public information is temporarily unavailable.')
    }
    if (!projectId) return projects
    if (projects.length !== 1) throw new NotFoundException('Project unavailable.')
    await this.countView(projectId)
    return projects[0]
  }

  // A failed count is logged and never blocks the public page.
  private async countView(projectId: string) {
    try {
      await this.prisma.$queryRaw(
        Prisma.sql`SELECT 0 AS s FROM (SELECT pathways.p90_count_public_view(${projectId}::uuid)) r`,
      )
    } catch {
      logger.warn({ event: 'PATHWAYS_PUBLIC_VIEW_COUNT_FAILED' })
    }
  }

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      const canonicalProjectId = await requireScopedProject(tx, actor, projectId)
      const [row] = await tx.$queryRaw<
        PublicationRow[]
      >(Prisma.sql`SELECT ${rowSelection} FROM pathways.project_publications
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${canonicalProjectId}::uuid`)
      if (!row) return null
      const { liveRevision, liveSnapshot, livePublishedAt, ...fields } = row
      const live =
        liveRevision !== null && liveSnapshot !== null && livePublishedAt !== null
          ? {
              revision: liveRevision,
              publishedAt: livePublishedAt.toISOString(),
              snapshot: {
                ...(liveSnapshot as object),
                publishedAt: livePublishedAt.toISOString(),
              } as PublicProjectResponse,
            }
          : null
      return { ...fields, updatedAt: row.updatedAt.toISOString(), live }
    })
  }

  transition(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    operation: PublicationOperation,
    input: unknown,
  ) {
    const parsed = publicationTransitionRequest.safeParse(input)
    if (
      !parsed.success ||
      (operation === 'SUBMIT') !== (parsed.data.summary !== undefined) ||
      (operation === 'SUBMIT') !== (parsed.data.selection !== undefined)
    )
      throw new BadRequestException('Invalid publication request.')
    const body = { ...parsed.data, clientRequestId: parsed.data.clientRequestId.toLowerCase() }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      permissions[operation],
      async (tx, actor) => {
        const projectId = await requireScopedProject(tx, actor, requestedProjectId)
        const hash = createHash('sha256')
          .update(
            JSON.stringify({
              projectId,
              operation,
              expectedRevision: body.expectedRevision,
              summary: body.summary ?? null,
              selection: body.selection ?? null,
            }),
          )
          .digest('hex')

        // Serialize this actor's request key, including collisions across project/operation.
        await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`${actor.organizationId}:${actor.userId}:${body.clientRequestId}`},0))`
        const [receipt] = await tx.$queryRaw<
          Array<{
            projectId: string
            operation: string
            hash: string
            revision: number
            state: string
            updatedAt: Date
          }>
        >`
        SELECT project_id::text AS "projectId",operation_code AS operation,request_hash AS hash,
          resulting_revision AS revision,resulting_state AS state,resulting_updated_at AS "updatedAt"
        FROM pathways.publication_requests WHERE organization_id=${actor.organizationId}::uuid
          AND actor_id=${actor.userId}::uuid AND request_id=${body.clientRequestId}::uuid`
        if (receipt) {
          if (
            receipt.hash !== hash ||
            receipt.projectId !== projectId ||
            receipt.operation !== operation
          )
            throw new ConflictException('Request key already used for different content.')
          return {
            revision: receipt.revision,
            state: receipt.state,
            updatedAt: receipt.updatedAt.toISOString(),
          }
        }
        const [current] = await tx.$queryRaw<
          PublicationRow[]
        >(Prisma.sql`SELECT ${rowSelection} FROM pathways.project_publications
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid FOR UPDATE`)
        if ((current?.revision ?? 0) !== body.expectedRevision)
          throw new ConflictException('Publication changed. Reload before continuing.')
        // The database trigger also refuses this; checking here returns a clear 409 first.
        if (operation === 'APPROVE' && current?.submittedById === actor.userId)
          throw new ConflictException('A different reviewer must approve this revision.')
        if (
          (operation === 'APPROVE' && current?.state !== 'FOR_REVIEW') ||
          (operation === 'PUBLISH' && current?.state !== 'APPROVED') ||
          (operation === 'WITHDRAW' && (current?.liveRevision ?? null) === null)
        )
          throw new ConflictException('Publication is not in the required review stage.')
        // The trigger validates the picks and fills the other snapshot keys.
        const picked = Prisma.sql`jsonb_build_object('media',${JSON.stringify(body.selection?.media)}::jsonb,'views',${JSON.stringify(body.selection?.views)}::jsonb)`
        const write = async (query: Prisma.Sql) => {
          try {
            return await tx.$queryRaw<PublicationRow[]>(query)
          } catch (error) {
            if (mediaNotPublishable(error))
              throw new BadRequestException('A chosen photo or video is no longer publishable.')
            throw error
          }
        }
        let row: PublicationRow | undefined
        if (!current) {
          if (operation !== 'SUBMIT')
            throw new ConflictException('Submit the public summary first.')
          ;[row] = await write(Prisma.sql`INSERT INTO pathways.project_publications
          (organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
          VALUES(${actor.organizationId}::uuid,${projectId}::uuid,1,'FOR_REVIEW','SUBMIT',${body.summary},${picked},${actor.userId}::uuid)
          RETURNING ${rowSelection}`)
        } else {
          const state =
            operation === 'APPROVE'
              ? 'APPROVED'
              : operation === 'PUBLISH'
                ? 'PUBLISHED'
                : 'FOR_REVIEW'
          const revision =
            body.expectedRevision + (operation === 'SUBMIT' || operation === 'WITHDRAW' ? 1 : 0)
          // A withdraw under a pending draft only clears the live columns and leaves the draft as it is.
          const sets =
            operation === 'WITHDRAW' && current.state !== 'PUBLISHED'
              ? []
              : [Prisma.sql`revision=${revision}`, Prisma.sql`state=${state}`]
          if (operation === 'SUBMIT')
            sets.push(Prisma.sql`summary=${body.summary}`, Prisma.sql`snapshot=${picked}`)
          if (operation === 'WITHDRAW')
            sets.push(
              Prisma.sql`live_revision=NULL,live_snapshot=NULL,live_published_at=NULL,live_published_by_id=NULL`,
            )
          ;[row] =
            await write(Prisma.sql`UPDATE pathways.project_publications SET ${Prisma.join(sets)}
          WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND revision=${body.expectedRevision}
          RETURNING ${rowSelection}`)
        }
        if (!row) throw new ConflictException('Publication changed.')
        await tx.$executeRaw`INSERT INTO pathways.publication_requests
        (organization_id,project_id,actor_id,request_id,operation_code,request_hash,resulting_revision,resulting_state,resulting_updated_at)
        VALUES(${actor.organizationId}::uuid,${projectId}::uuid,${actor.userId}::uuid,${body.clientRequestId}::uuid,${operation},${hash},${row.revision},${row.state},${row.updatedAt})`
        return { revision: row.revision, state: row.state, updatedAt: row.updatedAt.toISOString() }
      },
    )
  }
}
