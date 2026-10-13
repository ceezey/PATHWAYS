import { z } from 'zod'

const text = z.string().max(2000)
const date = z.string().max(40).nullable()
const statusLevel = z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_AVAILABLE'])

/** Structured Project summary content; the flat columns and rows stay as the fallback copy. */
export const reportSectionsSchema = z
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
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
            explanation: text,
            evaluatedAt: z.string().max(40),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict()

export type ReportSections = z.infer<typeof reportSectionsSchema>
export type StatusLevel = ReportSections['overview'][number]['status']
