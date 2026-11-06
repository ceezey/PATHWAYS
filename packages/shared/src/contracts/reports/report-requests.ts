import { z } from 'zod'

import { reportKinds } from '../../constants/domain-codes'

const reportContext = z
  .object({
    kind: z.enum(reportKinds),
    formId: z.guid().optional(),
    evaluationId: z.guid().optional(),
  })
  .strict()
type Context = { kind: string; formId?: string; evaluationId?: string }
const validForm = (body: Context) => (body.kind === 'SURVEY_FORM_RESULTS') === Boolean(body.formId)
const validRound = (body: Context) => !body.evaluationId || body.kind === 'EVALUATION_REPORT'
const roundMessage = 'Only evaluation reports accept an evaluation round.'

// Query of GET projects/:projectId/reports/preview.
export const reportPreviewQuery = reportContext
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export type ReportPreviewQuery = z.infer<typeof reportPreviewQuery>

// Body of POST projects/:projectId/reports.
export const generateReportRequest = reportContext
  .extend({
    clientRequestId: z.guid(),
    name: z.string().trim().min(1).max(200),
    format: z.enum(['CSV', 'XLSX', 'XLS', 'PDF']),
  })
  .strict()
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export type GenerateReportRequest = z.infer<typeof generateReportRequest>
