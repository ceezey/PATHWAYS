import { type GenerateReportRequest, reportKinds } from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { reportSectionsSchema } from '@/lib/api/report-sections'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const reportKind = z.enum(reportKinds)
const reportFormat = z.enum(['CSV', 'XLSX', 'XLS', 'PDF'])
const reportPreviewSchema = z
  .object({
    projectId: uuid,
    kind: reportKind,
    formId: uuid.nullable(),
    columns: z.array(z.string()).max(30),
    rows: z.array(z.array(z.string().max(2000)).max(30)).max(1000),
    sections: reportSectionsSchema.optional(),
    generatedAt: timestamp,
    unavailableReasons: z.array(z.string()).max(20),
  })
  .strict()
const reportSchema = z
  .object({
    id: uuid,
    name: z.string(),
    type: reportKind,
    format: reportFormat.nullable(),
    status: z.enum(['DRAFT', 'GENERATED', 'ARCHIVED']),
    generatedAt: timestamp.nullable(),
    evaluation: z
      .object({ title: z.string(), periodStart: dateOnly, periodEnd: dateOnly })
      .strict()
      .nullable(),
  })
  .strict()
const evaluationRoundSchema = z
  .object({
    id: uuid,
    title: z.string(),
    status: z.enum(['SIGNED_OFF', 'ARCHIVED']),
    periodStart: dateOnly,
    periodEnd: dateOnly,
    signedOffAt: timestamp.nullable(),
    overallScore: decimal.nullable(),
  })
  .strict()
export const reportsClient = {
  surveyForms: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/reports/survey-forms`,
      z
        .array(
          z
            .object({
              id: uuid,
              name: z.string(),
              code: z.string(),
              version: z.number().int().positive(),
            })
            .strict(),
        )
        .max(100),
      { signal },
    ),
  evaluationRounds: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/reports/evaluation-rounds`,
      z.array(evaluationRoundSchema).max(100),
      {
        signal,
      },
    ),
  reportPreview: (
    id: string,
    kind: z.infer<typeof reportKind>,
    signal?: AbortSignal,
    formId?: string,
    evaluationId?: string,
  ) =>
    ownedJsonRead(
      `${projectPath(id)}/reports/preview?kind=${reportKind.parse(kind)}${formId ? `&formId=${uuid.parse(formId)}` : ''}${evaluationId ? `&evaluationId=${uuid.parse(evaluationId)}` : ''}`,
      reportPreviewSchema.refine(
        (row) => row.projectId === id && row.kind === kind && row.formId === (formId ?? null),
      ),
      {
        signal,
      },
    ),
  reports: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/reports`, z.array(reportSchema).max(100), { signal }),
  generateReport: (id: string, body: GenerateReportRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/reports`,
      z
        .object({
          id: uuid,
          status: z.literal('GENERATED'),
          pdfFallback: z.literal(true).optional(),
        })
        .strict(),
      body,
    ),
}
