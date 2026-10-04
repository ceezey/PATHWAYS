import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import {
  type PublicationOperation,
  publicProjectSchema,
  publicationInputSchema,
} from './public.dto'

type PublicationRow = {
  revision: number
  state: 'FOR_REVIEW' | 'APPROVED' | 'PUBLISHED'
  summary: string
  snapshot: Prisma.JsonValue
  submittedById: string
  approvedById: string | null
  publishedById: string | null
  updatedAt: Date
}
const permissions = {
  SUBMIT: 'public.preview',
  APPROVE: 'public.approve',
  PUBLISH: 'public.publish',
  WITHDRAW: 'public.publish',
} as const
const rowSelection = Prisma.sql`revision,state,summary,snapshot,submitted_by_id::text AS "submittedById",
 approved_by_id::text AS "approvedById",published_by_id::text AS "publishedById",updated_at AS "updatedAt"`

@Injectable()
export class PublicService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async published(projectId?: string, offset = 0, limit = 50) {
    if (projectId !== undefined && !z.string().uuid().safeParse(projectId).success)
      throw new NotFoundException('Project unavailable.')
    const page = z
      .object({
        offset: z.number().int().min(0).max(10000),
        limit: z.number().int().min(1).max(100),
      })
      .safeParse({ offset, limit })
    if (!page.success) throw new BadRequestException('Invalid public page.')
    // This fixed entrypoint exposes only approved snapshots; no staff identity or source DTO is read.
    let projects: z.infer<typeof publicProjectSchema>[]
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ projects: unknown }>>`
        SELECT pathways.p34_public_projects(${projectId ?? null}::uuid,${offset}::integer,${limit}::integer) AS projects`
      projects = z.array(publicProjectSchema).max(100).parse(row?.projects)
    } catch {
      // Anonymous callers get a fixed outage response, never a database diagnostic.
      throw new ServiceUnavailableException('Public information is temporarily unavailable.')
    }
    if (projectId && projects.length !== 1) throw new NotFoundException('Project unavailable.')
    return projectId ? projects[0] : projects
  }

  private async requireProject(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    projectId: string,
  ) {
    if (!z.string().uuid().safeParse(projectId).success)
      throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  get(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'public.preview', async (tx, actor) => {
      const canonicalProjectId = await this.requireProject(tx, actor, projectId)
      const [row] = await tx.$queryRaw<
        PublicationRow[]
      >(Prisma.sql`SELECT ${rowSelection} FROM pathways.project_publications
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${canonicalProjectId}::uuid`)
      return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null
    })
  }

  transition(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    operation: PublicationOperation,
    input: unknown,
  ) {
    const parsed = publicationInputSchema.safeParse(input)
    if (!parsed.success || (operation === 'SUBMIT') !== (parsed.data.summary !== undefined))
      throw new BadRequestException('Invalid publication request.')
    const body = { ...parsed.data, clientRequestId: parsed.data.clientRequestId.toLowerCase() }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      permissions[operation],
      async (tx, actor) => {
        const projectId = await this.requireProject(tx, actor, requestedProjectId)
        const hash = createHash('sha256')
          .update(
            JSON.stringify({
              projectId,
              operation,
              expectedRevision: body.expectedRevision,
              summary: body.summary ?? null,
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
        if (operation === 'SUBMIT' && current?.state === 'PUBLISHED')
          throw new ConflictException('Withdraw the published revision before replacing it.')
        if (
          (operation === 'APPROVE' && current?.state !== 'FOR_REVIEW') ||
          (operation === 'PUBLISH' && current?.state !== 'APPROVED') ||
          (operation === 'WITHDRAW' && current?.state !== 'PUBLISHED')
        )
          throw new ConflictException('Publication is not in the required review stage.')
        let row: PublicationRow | undefined
        if (!current) {
          if (operation !== 'SUBMIT')
            throw new ConflictException('Submit the public summary first.')
          ;[row] = await tx.$queryRaw<
            PublicationRow[]
          >(Prisma.sql`INSERT INTO pathways.project_publications
          (organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
          VALUES(${actor.organizationId}::uuid,${projectId}::uuid,1,'FOR_REVIEW','SUBMIT',${body.summary},'{}'::jsonb,${actor.userId}::uuid)
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
          ;[row] = await tx.$queryRaw<
            PublicationRow[]
          >(Prisma.sql`UPDATE pathways.project_publications SET
          revision=${revision},state=${state},summary=${operation === 'SUBMIT' ? body.summary : current.summary}
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
