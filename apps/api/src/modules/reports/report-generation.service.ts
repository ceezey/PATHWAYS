import { randomUUID } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import type { GenerateReportRequest, ReportKindCode } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { ReportFormat } from './report-artifact'
import { sourceContent, sourceFingerprint } from './report-fingerprint'
import type { ReportSourceDeps } from './report-project-status-source'
import { loadReportSource } from './report-source.service'
import { uuid } from './reports.helpers'

export type Artifact = {
  id: string
  projectId: string
  formId: string | null
  evaluationId: string | null
  name: string
  type: ReportKindCode
  format: ReportFormat
  status: string
  hash: string
  sourceFingerprint: string | null
  bytes: bigint | null
  bucket: string | null
  key: string | null
  sha: string | null
  updatedAt: Date
}
export const artifactFields = Prisma.sql`id::text,project_id::text AS "projectId",form_id::text AS "formId",name,type::text,format::text,status::text,request_hash::text AS hash,source_fingerprint::text AS "sourceFingerprint",evaluation_id::text AS "evaluationId",artifact_byte_size AS bytes,bucket,object_key AS key,sha256::text AS sha,updated_at AS "updatedAt"`

// Reserves the report row for this request, or reuses the caller's earlier one.
export async function reserveReport(
  deps: ReportSourceDeps,
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  body: GenerateReportRequest,
  requestHash: string,
) {
  const source = await loadReportSource(
    deps,
    tx,
    actor,
    projectId,
    body.kind,
    body.formId,
    body.evaluationId,
  )
  if (body.kind === 'SURVEY_FORM_RESULTS') {
    if (!source.rows.length)
      throw new ConflictException('Survey aggregate unavailable for generation.')
    const [row] = await tx.$queryRaw<
      Array<{ value: unknown }>
    >`SELECT pathways.p34_reserve_survey_report(${projectId}::uuid,${body.formId}::uuid,${body.clientRequestId}::uuid,${requestHash},${body.name},${body.format}::pathways.report_format,${sourceFingerprint(source)}) AS value`
    const reserved = z
      .object({
        id: uuid,
        status: z.enum(['DRAFT', 'GENERATED']),
        updatedAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(row?.value)
    return {
      id: reserved.id,
      organizationId: actor.organizationId,
      source,
      complete: reserved.status === 'GENERATED',
      updatedAt: new Date(reserved.updatedAt),
    }
  }
  if (body.kind === 'EVALUATION_REPORT' && !source.evaluationId)
    throw new ConflictException('No signed-off evaluation available for generation.')
  await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`${actor.organizationId}:${actor.userId}:${body.clientRequestId}`},0))`
  const [existing] = await tx.$queryRaw<Artifact[]>(
    Prisma.sql`SELECT ${artifactFields} FROM pathways.reports WHERE organization_id=${actor.organizationId}::uuid AND created_by_id=${actor.userId}::uuid AND client_request_id=${body.clientRequestId}::uuid`,
  )
  if (existing && (existing.hash !== requestHash || existing.projectId !== projectId))
    throw new ConflictException('Request key used for different report content.')
  const id = existing?.id ?? randomUUID()
  if (!existing)
    await tx.$executeRaw`INSERT INTO pathways.reports(id,organization_id,project_id,name,type,format,created_by_id,client_request_id,request_hash,source_fingerprint,evaluation_id) VALUES(${id}::uuid,${actor.organizationId}::uuid,${projectId}::uuid,${body.name},${body.kind}::pathways.report_type,${body.format}::pathways.report_format,${actor.userId}::uuid,${body.clientRequestId}::uuid,${requestHash},${sourceFingerprint(source)},${source.evaluationId ?? null}::uuid)`
  if (existing && existing.sourceFingerprint !== sourceFingerprint(source))
    throw new ConflictException('Report source changed. Use a new report request.')
  return {
    id,
    organizationId: actor.organizationId,
    source,
    complete: existing?.status === 'GENERATED',
    updatedAt: existing?.updatedAt ?? null,
  }
}

// The reservation that finalization checks again.
type ReservedReport = Awaited<ReturnType<typeof reserveReport>>

// Marks the stored artifact generated once its source reads the same again.
export async function finalizeReport(
  deps: ReportSourceDeps,
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  body: GenerateReportRequest,
  requestHash: string,
  prepare: ReservedReport,
  key: string,
  sha: string,
  bytes: Buffer,
) {
  const current = await loadReportSource(
    deps,
    tx,
    actor,
    projectId,
    body.kind,
    body.formId,
    body.evaluationId,
  )
  if (JSON.stringify(sourceContent(current)) !== JSON.stringify(sourceContent(prepare.source)))
    throw new ConflictException('Report source changed. Generate again.')
  if (body.kind === 'SURVEY_FORM_RESULTS') {
    const [row] = await tx.$queryRaw<
      Array<{ value: unknown }>
    >`SELECT pathways.p34_finalize_survey_report(${projectId}::uuid,${prepare.id}::uuid,${body.clientRequestId}::uuid,${requestHash},${prepare.updatedAt},${key},${sha},${bytes.length}::bigint,${sourceFingerprint(current)}) AS value`
    return z
      .object({ id: uuid, status: z.literal('GENERATED') })
      .strict()
      .refine((ack) => ack.id === prepare.id)
      .parse(row?.value)
  }
  const count =
    await tx.$executeRaw`UPDATE pathways.reports SET status='GENERATED',bucket='pathways-private',object_key=${key},sha256=${sha},artifact_byte_size=${bytes.length},generated_by_id=${actor.userId}::uuid,generated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND id=${prepare.id}::uuid AND created_by_id=${actor.userId}::uuid AND client_request_id=${body.clientRequestId}::uuid AND request_hash=${requestHash} AND source_fingerprint=${sourceFingerprint(current)} AND status='DRAFT'`
  if (count !== 1) throw new ConflictException('Report already finalized or changed.')
  await writeAuditLog(tx, actor, {
    projectId,
    action: 'REPORT_GENERATED',
    entityType: 'Report',
    entityId: prepare.id,
  })
  return { id: prepare.id, status: 'GENERATED' as const }
}
