import { z } from 'zod'

import { reportKinds } from '../../constants/domain-codes'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const reportKind = z.enum(reportKinds)
const reportFormat = z.enum(['CSV', 'XLSX', 'XLS', 'PDF'])

// Response shapes of the report routes; the api only uses their types and the web parses them.

const text = z.string().max(2000)
const date = z.string().max(40).nullable()
const statusLevel = z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_AVAILABLE'])

/** Structured Project summary content; the flat columns and rows stay as the fallback copy. */
export const reportSectionsResponse = z
  .object({
    reportDate: z.string().max(40),
    information: z
      .object({
        code: text,
        title: text,
        status: text,
        sector: text,
        area: text,
        startDate: text,
        endDate: text,
        partners: text,
        manager: text.nullable(),
      })
      .strict(),
    overview: z
      .array(z.object({ area: text, status: statusLevel, comment: text }).strict())
      .max(10),
    keyFigures: z
      .array(
        z
          .object({
            label: text,
            state: z.enum(['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED']),
            value: text.nullable(),
            reason: text.nullable(),
            detail: text,
            percent: z.number().finite().min(-100000).max(100000).nullable(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    budget: z
      .array(
        z
          .object({
            line: text,
            currency: z.string().max(3),
            planned: text,
            approved: text,
            inReview: text,
            remaining: text,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    milestones: z
      .array(
        z
          .object({
            title: text,
            status: text,
            targetDate: date,
            completionDate: date,
            overdue: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    indicators: z
      .array(
        z
          .object({
            code: text,
            name: text,
            baseline: text.nullable(),
            target: text.nullable(),
            current: text,
            progress: text,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    alerts: z
      .array(
        z
          .object({
            title: text,
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable(),
            explanation: text,
            evaluatedAt: z.string().max(40),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict()

export type ReportSectionsResponse = z.infer<typeof reportSectionsResponse>
export type ReportStatusLevel = ReportSectionsResponse['overview'][number]['status']

// The stored report type also holds OTHER, which no route lists, so the web narrows it to a report kind.
const reportTypes = [...reportKinds, 'OTHER'] as const

// A preview of one report kind for a project, with the structured sections of the project summary.
export const reportPreviewResponse = z
  .object({
    projectId: uuid,
    kind: reportKind,
    formId: uuid.nullable(),
    columns: z.array(z.string()).max(30),
    rows: z.array(z.array(z.string().max(2000)).max(30)).max(1000),
    sections: reportSectionsResponse.optional(),
    generatedAt: timestamp,
    unavailableReasons: z.array(z.string()).max(20),
  })
  .strict()
export type ReportPreviewResponse = z.infer<typeof reportPreviewResponse>

// One saved report of a project.
export const reportResponse = z
  .object({
    id: uuid,
    name: z.string(),
    type: z.enum(reportTypes),
    format: reportFormat.nullable(),
    status: z.enum(['DRAFT', 'GENERATED', 'ARCHIVED']),
    generatedAt: timestamp.nullable(),
    evaluation: z
      .object({ title: z.string(), periodStart: dateOnly, periodEnd: dateOnly })
      .strict()
      .nullable(),
  })
  .strict()
export type ReportResponse = z.infer<typeof reportResponse>

// A closed evaluation round a report can be generated from; the route lists signed-off and archived rounds only.
export const evaluationRoundResponse = z
  .object({
    id: uuid,
    title: z.string(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),
    periodStart: dateOnly,
    periodEnd: dateOnly,
    signedOffAt: timestamp.nullable(),
    overallScore: decimal.nullable(),
  })
  .strict()
export type EvaluationRoundResponse = z.infer<typeof evaluationRoundResponse>

// A published training survey a survey report can use.
export const surveyFormResponse = z
  .object({ id: uuid, name: z.string(), code: z.string(), version: z.number().int().positive() })
  .strict()
export type SurveyFormResponse = z.infer<typeof surveyFormResponse>

// The receipt of a report generation; pdfFallback says the designed PDF could not be rendered.
export const generateReportResponse = z
  .object({
    id: uuid,
    status: z.literal('GENERATED'),
    pdfFallback: z.literal(true).optional(),
  })
  .strict()
export type GenerateReportResponse = z.infer<typeof generateReportResponse>
