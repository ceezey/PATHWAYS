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
import {
  type EvaluationRoundResponse,
  type GenerateReportResponse,
  type ReportPreviewResponse,
  type ReportResponse,
  type SurveyFormResponse,
  generateReportRequest,
  hasAtomicPermission,
  reportKindGrants,
  reportPreviewQuery,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { DashboardsService } from '../dashboards/dashboards.service'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { RulesHumanService } from '../rules/rules-human.service'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'
import { ReportArtifactInputError, createReportArtifact, reportMime } from './report-artifact'
import { sourceFingerprint } from './report-fingerprint'
import {
  type Artifact,
  artifactFields,
  finalizeReport,
  reserveReport,
} from './report-generation.service'
import { ReportPdfError, ReportPdfRenderer } from './report-pdf.renderer'
import type { ReportSourceDeps } from './report-project-status-source'
import { type ReportSource, loadReportSource } from './report-source.service'
import { assertReportPermission, readableReportKinds, uuid } from './reports.helpers'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
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
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}
  // The report source reads through these services in the caller's transaction.
  private sourceDeps(): ReportSourceDeps {
    return { overview: this.overview, dashboards: this.dashboards, rules: this.rules }
  }
  // A saved report is re-checked against the evaluation round it was generated from.
  private sourceOf(tx: Tx, actor: ApplicationIdentity, projectId: string, row: Artifact) {
    return loadReportSource(
      this.sourceDeps(),
      tx,
      actor,
      projectId,
      row.type,
      row.formId ?? undefined,
      row.type === 'EVALUATION_REPORT' ? (row.evaluationId ?? undefined) : undefined,
    )
  }
  preview(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = reportPreviewQuery.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid report context.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'reports.read',
      async (tx, actor) => {
        const source = await loadReportSource(
          this.sourceDeps(),
          tx,
          actor,
          projectId,
          parsed.data.kind,
          parsed.data.formId,
          parsed.data.evaluationId,
        )
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
        } satisfies ReportPreviewResponse
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
  surveyForms(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'reports.read', async (tx, actor) => {
      assertReportPermission(actor, 'SURVEY_FORM_RESULTS')
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'forms.read'))
        throw new ForbiddenException('Current form permission required.')
      await requireScopedProject(tx, actor, projectId)
      const rows = await tx.$queryRaw<
        Array<{ id: string; name: string; code: string; version: number }>
      >`SELECT f.id::text,f.name,f.code,f.version FROM pathways.digital_forms f WHERE f.organization_id=${actor.organizationId}::uuid AND f.project_id=${projectId}::uuid AND f.form_type='TRAINING_SURVEY' AND f.status='PUBLISHED' AND NOT EXISTS(SELECT FROM pathways.digital_forms newer WHERE newer.organization_id=f.organization_id AND newer.project_id=f.project_id AND newer.code=f.code AND newer.status='PUBLISHED' AND newer.version>f.version) ORDER BY f.code,f.id LIMIT 101`
      if (rows.length > 100) throw new BadRequestException('Select a smaller survey scope.')
      return rows satisfies SurveyFormResponse[]
    })
  }
  evaluationRounds(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'reports.read', async (tx, actor) => {
      assertReportPermission(actor, 'EVALUATION_REPORT')
      await requireScopedProject(tx, actor, projectId)
      const rows = await tx.projectEvaluation.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          status: { in: ['SIGNED_OFF', 'ARCHIVED'] },
        },
        orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          signedOffAt: true,
          overallScore: true,
        },
        take: 101,
      })
      if (rows.length > 100) throw new BadRequestException('Select a smaller evaluation scope.')
      return rows.map(
        (row): EvaluationRoundResponse => ({
          id: row.id,
          title: row.title,
          status: row.status,
          periodStart: row.periodStart.toISOString().slice(0, 10),
          periodEnd: row.periodEnd.toISOString().slice(0, 10),
          signedOffAt: row.signedOffAt?.toISOString() ?? null,
          overallScore: row.overallScore?.toString() ?? null,
        }),
      )
    })
  }
  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'reports.read', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const allowed = readableReportKinds(actor)
      if (!allowed.length) return []
      const rows = await tx.report.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          type: { in: allowed },
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          format: true,
          status: true,
          generatedAt: true,
          evaluation: { select: { title: true, periodStart: true, periodEnd: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 101,
      })
      if (rows.length > 100) throw new BadRequestException('Select a smaller report scope.')
      return rows.map(
        ({ evaluation, ...row }): ReportResponse => ({
          ...row,
          generatedAt: row.generatedAt?.toISOString() ?? null,
          evaluation: evaluation
            ? {
                title: evaluation.title,
                periodStart: evaluation.periodStart.toISOString().slice(0, 10),
                periodEnd: evaluation.periodEnd.toISOString().slice(0, 10),
              }
            : null,
        }),
      )
    })
  }
  // Designed PDF through headless Chromium; null keeps the pdfkit artifact as the fallback.
  private async designedPdf(id: string, title: string, source: ReportSource) {
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
  async generate(
    identity: ApplicationIdentity,
    requestedProjectId: string,
    input: unknown,
  ): Promise<GenerateReportResponse> {
    if (!uuid.safeParse(requestedProjectId).success)
      throw new NotFoundException('Project unavailable.')
    const projectId = requestedProjectId.toLowerCase()
    const parsed = generateReportRequest.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid report request.')
    const body = {
      ...parsed.data,
      clientRequestId: parsed.data.clientRequestId.toLowerCase(),
      ...(parsed.data.formId ? { formId: parsed.data.formId.toLowerCase() } : {}),
      ...(parsed.data.evaluationId ? { evaluationId: parsed.data.evaluationId.toLowerCase() } : {}),
    }
    const requestHash = hash(
      JSON.stringify({
        projectId,
        formId: body.formId ?? null,
        ...(body.evaluationId ? { evaluationId: body.evaluationId } : {}),
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
        return reserveReport(this.sourceDeps(), tx, actor, projectId, body, requestHash)
      },
      { isolationLevel: 'RepeatableRead' },
    )
    if (prepare.complete) return { id: prepare.id, status: 'GENERATED' as const }
    let bytes: Buffer
    // Set when a PDF was asked for and Chromium could not render it, so the caller can say so.
    let pdfFallback = false
    try {
      const designed =
        body.format === 'PDF' ? await this.designedPdf(prepare.id, body.name, prepare.source) : null
      pdfFallback = body.format === 'PDF' && designed === null
      bytes =
        designed ??
        (await createReportArtifact(
          body.name,
          [prepare.source.columns, ...prepare.source.rows],
          body.format,
        ))
    } catch (error) {
      // Correctable input keeps its fixed descriptive message; integrity/renderer faults do not.
      if (error instanceof ReportArtifactInputError)
        throw new UnprocessableEntityException(error.message)
      // Only the error name and system code are logged; report content never is.
      const code = (error as { code?: unknown } | null)?.code
      new Logger(ReportsService.name).warn(
        `Report artifact unavailable for report ${prepare.id} (${body.format}): ${error instanceof Error ? error.name : 'Error'}${typeof code === 'string' ? ` ${code}` : ''}`,
      )
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
        const read = this.storageFactories.createPrivateInspectionReader({
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
      const acknowledgement = await withAuthorizedOperation(
        this.prisma,
        identity,
        'reports.generate',
        async (tx, actor) => {
          return finalizeReport(
            this.sourceDeps(),
            tx,
            actor,
            projectId,
            body,
            requestHash,
            prepare,
            key,
            sha,
            bytes,
          )
        },
        { isolationLevel: 'RepeatableRead' },
      )
      return pdfFallback ? { ...acknowledgement, pdfFallback: true as const } : acknowledgement
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
          if (!row || !Object.hasOwn(reportKindGrants, row.type))
            throw new NotFoundException('Report unavailable.')
          assertReportPermission(actor, row.type)
          if (
            !row.sourceFingerprint ||
            sourceFingerprint(await this.sourceOf(tx, actor, projectId, row)) !==
              row.sourceFingerprint
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
      const read = this.storageFactories.createPrivateInspectionReader({
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
        assertReportPermission(actor, row.type)
        if (
          !row.sourceFingerprint ||
          sourceFingerprint(await this.sourceOf(tx, actor, projectId, row)) !==
            row.sourceFingerprint
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
        await writeAuditLog(tx, actor, {
          projectId,
          action: 'REPORT_EXPORTED',
          entityType: 'Report',
          entityId: id,
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
