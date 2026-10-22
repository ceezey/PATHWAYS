import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { type ReportKindCode, hasAtomicPermission, metricCellSchema } from '@pathways/shared'
import { z } from 'zod'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import {
  evaluationReportTable,
  monitoringReportPeriod,
  monitoringReportTable,
} from './report-monitoring-evaluation-source'
import { type ProjectSections, flattenSections } from './report-project-status'
import { type ReportSourceDeps, projectStatusSource } from './report-project-status-source'
import { assertReportPermission, uuid } from './reports.helpers'

const metricText = (input: unknown) => {
  const cell = metricCellSchema.parse(input)
  return { value: cell.value ?? 'Not available', state: cell.state, reason: cell.reason ?? '' }
}

export type ReportSource = {
  projectId: string
  formId: string | null
  kind: ReportKindCode
  evaluationId?: string | null
  columns: string[]
  rows: string[][]
  sections?: ProjectSections
  generatedAt: string
  unavailableReasons: string[]
}

// Builds one report kind's columns and rows for a project inside the caller's transaction.
export async function loadReportSource(
  deps: ReportSourceDeps,
  tx: Tx,
  actor: ApplicationIdentity,
  requestedProjectId: string,
  kind: ReportKindCode,
  requestedFormId?: string,
  requestedEvaluationId?: string,
): Promise<ReportSource> {
  assertReportPermission(actor, kind)
  if (!uuid.safeParse(requestedProjectId).success)
    throw new NotFoundException('Project unavailable.')
  const projectId = requestedProjectId.toLowerCase()
  if (requestedFormId !== undefined && !uuid.safeParse(requestedFormId).success)
    throw new NotFoundException('Form unavailable.')
  const formId = requestedFormId?.toLowerCase()
  if (requestedEvaluationId !== undefined && !uuid.safeParse(requestedEvaluationId).success)
    throw new NotFoundException('Evaluation unavailable.')
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
      implementingPartnerLinks: {
        select: { partner: { select: { name: true } } },
        orderBy: { partnerId: 'asc' },
        take: 20,
      },
      programManager: { select: { fullName: true } },
    },
  })
  if (!project) throw new NotFoundException('Project unavailable.')
  const result: ReportSource = {
    projectId,
    formId: formId ?? null,
    kind,
    columns: [],
    rows: [],
    generatedAt: new Date().toISOString(),
    unavailableReasons: [],
  }
  if (kind === 'PROJECT_SUMMARY') {
    const status = await projectStatusSource(deps, tx, actor, projectId, project)
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
    const data = await deps.dashboards.monitoringInTransaction(tx, actor, query, {
      ...period,
      businessTimeZone: readApiEnv(process.env).BUSINESS_TIME_ZONE,
    })
    Object.assign(result, monitoringReportTable(data))
  } else if (kind === 'EVALUATION_REPORT') {
    const table = await evaluationReportTable(
      tx,
      actor,
      projectId,
      requestedEvaluationId?.toLowerCase(),
    )
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
        result.unavailableReasons = ['Survey counts and means are not available for this report.']
    }
  }
  if (Buffer.byteLength(JSON.stringify(result.rows), 'utf8') > 2_000_000)
    throw new BadRequestException('Report source exceeds supported size.')
  return result
}
