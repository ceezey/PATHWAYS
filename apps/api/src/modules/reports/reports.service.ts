import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { metricCellSchema } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { DashboardsService } from '../dashboards/dashboards.service'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { ReportPdfError, ReportPdfRenderer } from '../report-pdf/report-pdf.renderer'
import { RulesHumanService } from '../rules/rules-human.service'
import { createPrivateInspectionReader } from '../storage/private-inspection-reader'
import { StorageService } from '../storage/storage.service'
import {
  ReportArtifactInputError,
  type ReportFormat,
  createReportArtifact,
  reportMime,
} from './report-artifact'
import { type ProjectSections, flattenSections } from './report-project-status'
import { projectStatusSource } from './report-project-status-source'
import {
  evaluationReportTable,
  extraKindRequires,
  isExtraReportKind,
  monitoringReportPeriod,
  monitoringReportTable,
} from './report-sources-extra'
import { type ReportKind, reportInputSchema, reportQuerySchema } from './reports.dto'

const kindPermission = {
  PROJECT_SUMMARY: 'reports.project.read',
  INDICATOR_SUMMARY: 'reports.indicator.read',
  BENEFICIARY_SUMMARY: 'reports.beneficiary.read',
  SURVEY_FORM_RESULTS: 'reports.project.read',
  MONITORING_REPORT: 'reports.indicator.read',
  EVALUATION_REPORT: 'reports.project.read',
} as const
const uuid = z.string().uuid()
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const metricText = (input: unknown) => {
  const cell = metricCellSchema.parse(input)
  return { value: cell.value ?? 'Not available', state: cell.state, reason: cell.reason ?? '' }
}
type Preview = {
  projectId: string
  formId: string | null
  kind: ReportKind
  evaluationId?: string | null
  columns: string[]
  rows: string[][]
  sections?: ProjectSections
  generatedAt: string
  unavailableReasons: string[]
}
const sourceFingerprint = (source: Preview) =>
  hash(
    JSON.stringify({
      projectId: source.projectId,
      formId: source.formId,
      ...(source.evaluationId ? { evaluationId: source.evaluationId } : {}),
      kind: source.kind,
      columns: source.columns,
      rows: source.rows,
      ...(source.sections ? { sections: source.sections } : {}),
      unavailableReasons: source.unavailableReasons,
    }),
  )
type Artifact = {
  id: string
  projectId: string
  formId: string | null
  name: string
  type: ReportKind
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
const artifactFields = Prisma.sql`id::text,project_id::text AS "projectId",form_id::text AS "formId",name,type::text,format::text,status::text,request_hash::text AS hash,source_fingerprint::text AS "sourceFingerprint",artifact_byte_size AS bytes,bucket,object_key AS key,sha256::text AS sha,updated_at AS "updatedAt"`
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
    @Inject(ReportPdfRenderer) private readonly pdf: ReportPdfRenderer,
    @Inject(ProjectOverviewMetricsService)
    private readonly overview: ProjectOverviewMetricsService,
    @Inject(RulesHumanService) private readonly rules: RulesHumanService,
  ) {}
  private permissions(actor: ApplicationIdentity, kind: ReportKind) {
    if (
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'reports.read') ||
      !hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) ||
      (isExtraReportKind(kind) &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) ||
      (kind === 'SURVEY_FORM_RESULTS' &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read'))
    )
      throw new ForbiddenException('Current report permission required.')
  }
  private async source(
    tx: Prisma.TransactionClient,
    actor: ApplicationIdentity,
    requestedProjectId: string,
    kind: ReportKind,
    requestedFormId?: string,
  ): Promise<Preview> {
    this.permissions(actor, kind)
    if (!uuid.safeParse(requestedProjectId).success)
      throw new NotFoundException('Project unavailable.')
    const projectId = requestedProjectId.toLowerCase()
    if (requestedFormId !== undefined && !uuid.safeParse(requestedFormId).success)
      throw new NotFoundException('Form unavailable.')
    const formId = requestedFormId?.toLowerCase()
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId }] },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        implementationArea: true,
        sector: true,
        startDate: true,
        endDate: true,
        implementingPartners: true,
        programManager: { select: { fullName: true } },
      },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    const result: Preview = {
      projectId,
      formId: formId ?? null,
      kind,
      columns: [],
      rows: [],
      generatedAt: new Date().toISOString(),
      unavailableReasons: [],
    }
    if (kind === 'PROJECT_SUMMARY') {
      const status = await projectStatusSource(
        { overview: this.overview, dashboards: this.dashboards, rules: this.rules },
        tx,
        actor,
        projectId,
        project,
      )
      Object.assign(result, flattenSections(status.sections), {
        sections: status.sections,
        unavailableReasons: status.unavailableReasons,
      })
    } else if (kind === 'INDICATOR_SUMMARY') {
      const [row] = await tx.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT pathways.p34_indicator_report(${projectId}::uuid,${readApiEnv(process.env).BUSINESS_TIME_ZONE}) AS value`
      const indicators = z
        .array(
          z
            .object({
              id: uuid,
              name: z.string(),
              code: z.string(),
              unitLabel: z.string().nullable(),
              baseline: z.string().nullable(),
              target: z.string().nullable(),
              // Legacy indicators may predate the required direction; it is not a report column.
              direction: z.string().nullable(),
              periodStart: z.string().nullable(),
              periodEnd: z.string().nullable(),
              current: metricCellSchema,
            })
            .strict(),
        )
        .max(100)
        .parse(row?.value)
      result.columns = [
        'Code',
        'Indicator',
        'Unit',
        'Baseline',
        'Target',
        'Current',
        'Metric state',
        'Reason',
        'Period start',
        'Period end',
      ]
      result.rows = indicators.map((value) => {
        const cell = metricText(value.current)
        return [
          value.code,
          value.name,
          value.unitLabel ?? '',
          value.baseline ?? 'Not specified',
          value.target ?? 'Not specified',
          cell.value,
          cell.state,
          cell.reason,
          value.periodStart ?? '',
          value.periodEnd ?? '',
        ]
      })
    } else if (kind === 'BENEFICIARY_SUMMARY') {
      if (
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.saddd.read') ||
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.aggregates.read')
      )
        throw new ForbiddenException('Current aggregate permission required.')
      if (!project.startDate || !project.endDate) {
        result.unavailableReasons = ['Project dates are required for the fixed SADDD release.']
        return result
      }
      const [row] = await tx.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT pathways.p06_saddd(${actor.organizationId}::uuid,ARRAY[${projectId}::uuid],${project.startDate}::date,${project.endDate}::date,${readApiEnv(process.env).BUSINESS_TIME_ZONE}) AS value`
      const bucket = z
        .object({ key: z.string(), label: z.string(), metric: metricCellSchema })
        .strict()
      const aggregate = z
        .object({
          total: metricCellSchema,
          sex: z.array(bucket).max(5),
          age: z.array(bucket).max(6),
          disability: z.array(bucket).max(3),
          completeness: z.array(bucket).max(6),
          releaseState: z.enum(['RELEASED', 'STALE']),
        })
        .strict()
        .parse(row?.value)
      result.columns = ['Dimension', 'Category', 'Value', 'Metric state', 'Reason']
      const total = metricText(aggregate.total)
      result.rows = [['Total', 'Individuals', total.value, total.state, total.reason]]
      for (const dimension of ['sex', 'age', 'disability', 'completeness'] as const)
        for (const value of aggregate[dimension]) {
          const cell = metricText(value.metric)
          result.rows.push([dimension, value.label, cell.value, cell.state, cell.reason])
        }
    }
    if (kind === 'MONITORING_REPORT') {
      const period = monitoringReportPeriod(project)
      if (!period) {
        result.unavailableReasons = ['Project dates are required for the monitoring report.']
        return result
      }
      const query = { projectId, ...period }
      const data = await this.dashboards.monitoringInTransaction(tx, actor, query, {
        ...period,
        businessTimeZone: readApiEnv(process.env).BUSINESS_TIME_ZONE,
      })
      Object.assign(result, monitoringReportTable(data))
    } else if (kind === 'EVALUATION_REPORT') {
      const table = await evaluationReportTable(tx, actor, projectId)
      Object.assign(result, table)
      if (!table.evaluationId)
        result.unavailableReasons = ['No signed-off evaluation is available for this project.']
    }
    if (kind === 'SURVEY_FORM_RESULTS') {
      if (!uuid.safeParse(formId).success) throw new BadRequestException('Survey form required.')
      const [row] = await tx.$queryRaw<
        Array<{ value: unknown }>
      >`WITH aggregate AS (SELECT pathways.p34_survey_report(${projectId}::uuid,${formId}::uuid) AS value) SELECT value || jsonb_build_object('fields',coalesce((SELECT jsonb_agg(field || jsonb_build_object('mean',field->>'mean') ORDER BY ordinal) FROM jsonb_array_elements(value->'fields') WITH ORDINALITY AS cells(field,ordinal)),'[]'::jsonb)) AS value FROM aggregate`
      const count = z.number().int().min(0).max(10000).nullable()
      const aggregate = z
        .object({
          state: z.enum(['AVAILABLE', 'SUPPRESSED', 'STALE', 'MISSING']),
          respondents: count,
          formId: uuid.optional(),
          formVersion: z.number().int().positive().optional(),
          fields: z
            .array(
              z
                .object({
                  code: z.string().max(200),
                  label: z.string().max(1000),
                  type: z.enum(['INTEGER', 'DECIMAL', 'BOOLEAN']),
                  answered: count,
                  missing: count,
                  trueCount: count,
                  falseCount: count,
                  mean: z
                    .string()
                    .regex(/^-?\d{1,14}(?:\.\d{1,4})?$/)
                    .nullable(),
                  meanState: z.enum(['AVAILABLE', 'MISSING', 'SUPPRESSED']),
                })
                .strict(),
            )
            .max(100),
        })
        .strict()
        .refine(
          (value) =>
            value.state === 'SUPPRESSED'
              ? value.respondents === null &&
                value.fields.every(
                  (field) =>
                    field.answered === null &&
                    field.missing === null &&
                    field.trueCount === null &&
                    field.falseCount === null &&
                    field.mean === null &&
                    field.meanState === 'SUPPRESSED',
                )
              : value.state === 'STALE' || value.state === 'MISSING'
                ? value.respondents === null && value.fields.length === 0
                : value.respondents !== null && value.formId === formId,
          'Invalid survey release shape',
        )
        .parse(row?.value)
      if (aggregate.formId && aggregate.formId !== formId)
        throw new ServiceUnavailableException('Survey source mismatch.')
      if (aggregate.state === 'MISSING' || aggregate.state === 'STALE') {
        result.unavailableReasons = [
          aggregate.state === 'STALE'
            ? 'Survey release is stale; source changes cannot be released again.'
            : 'No eligible published survey aggregate is available.',
        ]
      } else {
        result.columns = [
          'Field',
          'Type',
          'Respondents',
          'Answered',
          'Missing',
          'True',
          'False',
          'Mean',
          'State',
        ]
        result.rows = aggregate.fields.map((field) => [
          field.label,
          field.type,
          aggregate.respondents?.toString() ?? 'Not available',
          field.answered?.toString() ?? 'Not available',
          field.missing?.toString() ?? 'Not available',
          field.trueCount?.toString() ?? 'Not available',
          field.falseCount?.toString() ?? 'Not available',
          field.mean?.toString() ?? 'Not available',
          field.meanState,
        ])
        if (aggregate.state === 'SUPPRESSED')
          result.unavailableReasons = [
            'All survey counts and means are suppressed to protect small groups.',
          ]
      }
    }
    if (Buffer.byteLength(JSON.stringify(result.rows), 'utf8') > 2_000_000)
      throw new BadRequestException('Report source exceeds supported size.')
    return result
  }
  preview(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = reportQuerySchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid report context.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.read',
      async (tx, actor) => {
        const source = await this.source(tx, actor, projectId, parsed.data.kind, parsed.data.formId)
        // Explicit allowlist keeps internal ids such as evaluationId out of the response.
        return {
          projectId: source.projectId,
          formId: source.formId,
          kind: source.kind,
          columns: source.columns,
          rows: source.rows,
          ...(source.sections ? { sections: source.sections } : {}),
          generatedAt: source.generatedAt,
          unavailableReasons: source.unavailableReasons,
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
  surveyForms(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'reports.read', async (tx, actor) => {
      this.permissions(actor, 'SURVEY_FORM_RESULTS')
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'forms.read'))
        throw new ForbiddenException('Current form permission required.')
      if (
        !uuid.safeParse(projectId).success ||
        !(await tx.project.findFirst({
          where: { AND: [projectScope(actor), { id: projectId }] },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Project unavailable.')
      const rows = await tx.$queryRaw<
        Array<{ id: string; name: string; code: string; version: number }>
      >`SELECT f.id::text,f.name,f.code,f.version FROM pathways.digital_forms f WHERE f.organization_id=${actor.organizationId}::uuid AND f.project_id=${projectId}::uuid AND f.form_type='TRAINING_SURVEY' AND f.status='PUBLISHED' AND NOT EXISTS(SELECT FROM pathways.digital_forms newer WHERE newer.organization_id=f.organization_id AND newer.project_id=f.project_id AND newer.code=f.code AND newer.status='PUBLISHED' AND newer.version>f.version) ORDER BY f.code,f.id LIMIT 101`
      if (rows.length > 100) throw new BadRequestException('Select a smaller survey scope.')
      return rows
    })
  }
  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'reports.read', async (tx, actor) => {
      if (
        !uuid.safeParse(projectId).success ||
        !(await tx.project.findFirst({
          where: { AND: [projectScope(actor), { id: projectId }] },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Project unavailable.')
      const allowed = (Object.keys(kindPermission) as ReportKind[]).filter(
        (kind) =>
          hasAtomicPermission(actor.roles[0], actor.permissions, kindPermission[kind]) &&
          (kind !== 'BENEFICIARY_SUMMARY' ||
            (hasAtomicPermission(actor.roles[0], actor.permissions, 'analytics.saddd.read') &&
              hasAtomicPermission(
                actor.roles[0],
                actor.permissions,
                'beneficiaries.aggregates.read',
              ))) &&
          (!isExtraReportKind(kind) ||
            hasAtomicPermission(actor.roles[0], actor.permissions, extraKindRequires[kind])) &&
          (kind !== 'SURVEY_FORM_RESULTS' ||
            hasAtomicPermission(actor.roles[0], actor.permissions, 'assessments.read')),
      )
      if (!allowed.length) return []
      const rows = await tx.report.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          type: { in: allowed },
          archivedAt: null,
        },
        select: { id: true, name: true, type: true, format: true, status: true, generatedAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 101,
      })
      if (rows.length > 100) throw new BadRequestException('Select a smaller report scope.')
      return rows.map((row) => ({ ...row, generatedAt: row.generatedAt?.toISOString() ?? null }))
    })
  }
  // Designed PDF through headless Chromium; null keeps the pdfkit artifact as the fallback.
  private async designedPdf(id: string, title: string, source: Preview) {
    try {
      return await this.pdf.render(id, {
        title,
        kind: source.kind,
        columns: source.columns,
        rows: source.rows,
        ...(source.sections ? { sections: source.sections } : {}),
        generatedAt: source.generatedAt,
        unavailableReasons: source.unavailableReasons,
      })
    } catch (error) {
      const known = error instanceof ReportPdfError ? error : null
      const cause = known?.causeName ?? (error instanceof Error ? error.name : 'Error')
      new Logger(ReportsService.name).warn(
        `Designed PDF unavailable for report ${id} at ${known?.stage ?? 'unknown'} (${cause}); using pdfkit.`,
      )
      return null
    }
  }
  async generate(identity: ApplicationIdentity, requestedProjectId: string, input: unknown) {
    if (!uuid.safeParse(requestedProjectId).success)
      throw new NotFoundException('Project unavailable.')
    const projectId = requestedProjectId.toLowerCase()
    const parsed = reportInputSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid report request.')
    const body = {
      ...parsed.data,
      clientRequestId: parsed.data.clientRequestId.toLowerCase(),
      ...(parsed.data.formId ? { formId: parsed.data.formId.toLowerCase() } : {}),
    }
    const requestHash = hash(
      JSON.stringify({
        projectId,
        formId: body.formId ?? null,
        name: body.name,
        kind: body.kind,
        format: body.format,
      }),
    )
    const prepare = await withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.generate',
      async (tx, actor) => {
        const source = await this.source(tx, actor, projectId, body.kind, body.formId)
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
      },
      { isolationLevel: 'RepeatableRead' },
    )
    if (prepare.complete) return { id: prepare.id, status: 'GENERATED' as const }
    let bytes: Buffer
    try {
      bytes =
        (body.format === 'PDF'
          ? await this.designedPdf(prepare.id, body.name, prepare.source)
          : null) ??
        (await createReportArtifact(
          body.name,
          [prepare.source.columns, ...prepare.source.rows],
          body.format,
        ))
    } catch (error) {
      // Correctable input keeps its fixed descriptive message; integrity/renderer faults do not.
      if (error instanceof ReportArtifactInputError)
        throw new UnprocessableEntityException(error.message)
      throw new ServiceUnavailableException('Report generation temporarily unavailable.')
    }
    const sha = hash(bytes)
    const key = `organizations/${prepare.organizationId}/projects/${projectId}/reports/${prepare.id}/${randomUUID()}.${body.format.toLowerCase()}`
    let uploaded = false
    let finalizationAttempted = false
    try {
      try {
        await this.storage.uploadPrivateFile(
          'pathways-private',
          key,
          bytes,
          reportMime[body.format],
        )
      } catch {
        // Provider errors are not diagnostics; an outage is unavailable, never a 500.
        throw new ServiceUnavailableException('Private report storage unavailable.')
      }
      uploaded = true
      const env = readApiEnv(process.env)
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
        throw new ServiceUnavailableException('Private report storage unavailable.')
      try {
        const read = createPrivateInspectionReader({
          serviceOrigin: env.SUPABASE_URL,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
          evidenceBucket: 'pathways-private',
          objectKind: 'reports',
        })
        await read({
          organizationId: prepare.organizationId,
          projectId,
          evidenceId: prepare.id,
          bucket: 'pathways-private',
          objectKey: key,
          expectedBytes: bytes.length,
          expectedSha256: sha,
          signal: AbortSignal.timeout(10000),
          deadlineMonotonicMs: performance.now() + 10000,
        })
      } catch {
        throw new ServiceUnavailableException('Private report storage unavailable.')
      }
      finalizationAttempted = true
      return await withAuthorizedOperation(
        this.prisma,
        identity,
        'reports.generate',
        async (tx, actor) => {
          const current = await this.source(tx, actor, projectId, body.kind, body.formId)
          if (
            JSON.stringify({
              columns: current.columns,
              rows: current.rows,
              sections: current.sections,
              unavailableReasons: current.unavailableReasons,
            }) !==
            JSON.stringify({
              columns: prepare.source.columns,
              rows: prepare.source.rows,
              sections: prepare.source.sections,
              unavailableReasons: prepare.source.unavailableReasons,
            })
          )
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
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              actorUserId: actor.userId,
              action: 'REPORT_GENERATED',
              entityType: 'Report',
              entityId: prepare.id,
            },
          })
          return { id: prepare.id, status: 'GENERATED' as const }
        },
        { isolationLevel: 'RepeatableRead' },
      )
    } catch (error) {
      if (uploaded && !finalizationAttempted)
        await this.storage.deleteFile('pathways-private', key).catch(() => undefined)
      if (uploaded && finalizationAttempted)
        new Logger('REPORT_ARTIFACT_RECOVERY_REQUIRED').warn({
          event: 'REPORT_ARTIFACT_RECOVERY_REQUIRED',
          allocatedId: prepare.id,
        })
      throw error
    }
  }
  async export(identity: ApplicationIdentity, requestedProjectId: string, requestedId: string) {
    if (!uuid.safeParse(requestedId).success || !uuid.safeParse(requestedProjectId).success)
      throw new NotFoundException('Report unavailable.')
    const projectId = requestedProjectId.toLowerCase()
    const id = requestedId.toLowerCase()
    const admit = () =>
      withAuthorizedOperation(
        this.prisma,
        identity,
        'reports.export',
        async (tx, actor) => {
          const [row] = await tx.$queryRaw<Artifact[]>(
            Prisma.sql`SELECT ${artifactFields} FROM pathways.reports WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND id=${id}::uuid AND status='GENERATED' AND archived_at IS NULL`,
          )
          if (!row || !Object.hasOwn(kindPermission, row.type))
            throw new NotFoundException('Report unavailable.')
          this.permissions(actor, row.type)
          if (
            !row.sourceFingerprint ||
            sourceFingerprint(
              await this.source(tx, actor, projectId, row.type, row.formId ?? undefined),
            ) !== row.sourceFingerprint
          )
            throw new ConflictException('Report source is stale. Generate a current report.')
          if (
            !(await tx.project.findFirst({
              where: { AND: [projectScope(actor), { id: projectId }] },
              select: { id: true },
            }))
          )
            throw new NotFoundException('Report unavailable.')
          return { row, organizationId: actor.organizationId }
        },
        { isolationLevel: 'RepeatableRead' },
      )
    const initial = await admit()
    const row = initial.row
    const env = readApiEnv(process.env)
    if (
      row.bucket !== 'pathways-private' ||
      !row.key ||
      !row.sha ||
      row.bytes === null ||
      !Object.hasOwn(reportMime, row.format) ||
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    )
      throw new ServiceUnavailableException('Private report artifact unavailable.')
    let bytes: Buffer
    try {
      const read = createPrivateInspectionReader({
        serviceOrigin: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        evidenceBucket: 'pathways-private',
        objectKind: 'reports',
      })
      bytes = await read({
        organizationId: initial.organizationId,
        projectId,
        evidenceId: id,
        bucket: row.bucket,
        objectKey: row.key,
        expectedBytes: Number(row.bytes),
        expectedSha256: row.sha,
        signal: AbortSignal.timeout(10000),
        deadlineMonotonicMs: performance.now() + 10000,
      })
    } catch {
      throw new ServiceUnavailableException('Private report artifact unavailable.')
    }
    await withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.export',
      async (tx, actor) => {
        this.permissions(actor, row.type)
        if (
          !row.sourceFingerprint ||
          sourceFingerprint(
            await this.source(tx, actor, projectId, row.type, row.formId ?? undefined),
          ) !== row.sourceFingerprint
        )
          throw new ConflictException('Report source changed. Generate a current report.')
        const count = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id::text FROM pathways.reports WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND id=${id}::uuid AND status='GENERATED' AND archived_at IS NULL AND updated_at=${row.updatedAt} AND object_key=${row.key} AND sha256=${row.sha} AND artifact_byte_size=${row.bytes} FOR SHARE`
        if (
          count.length !== 1 ||
          !(await tx.project.findFirst({
            where: { AND: [projectScope(actor), { id: projectId }] },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Report unavailable.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            actorUserId: actor.userId,
            action: 'REPORT_EXPORTED',
            entityType: 'Report',
            entityId: id,
          },
        })
      },
      { isolationLevel: 'RepeatableRead' },
    )
    return {
      bytes,
      contentType: reportMime[row.format],
      fileName: `report-${id}.${row.format.toLowerCase()}`,
    }
  }
}
