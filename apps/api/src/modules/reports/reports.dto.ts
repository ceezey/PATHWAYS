import { z } from 'zod'
export const reportKinds = [
  'PROJECT_SUMMARY',
  'INDICATOR_SUMMARY',
  'BENEFICIARY_SUMMARY',
  'SURVEY_FORM_RESULTS',
  'MONITORING_REPORT',
  'EVALUATION_REPORT',
] as const
const reportContext = z
  .object({
    kind: z.enum(reportKinds),
    formId: z.string().uuid().optional(),
    evaluationId: z.string().uuid().optional(),
  })
  .strict()
type Context = { kind: string; formId?: string; evaluationId?: string }
const validForm = (body: Context) => (body.kind === 'SURVEY_FORM_RESULTS') === Boolean(body.formId)
const validRound = (body: Context) => !body.evaluationId || body.kind === 'EVALUATION_REPORT'
const roundMessage = 'Only evaluation reports accept an evaluation round.'
export const reportQuerySchema = reportContext
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export const reportInputSchema = reportContext
  .extend({
    clientRequestId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    format: z.enum(['CSV', 'XLSX', 'XLS', 'PDF']),
  })
  .strict()
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
  .refine(validRound, roundMessage)
export type ReportKind = (typeof reportKinds)[number]
