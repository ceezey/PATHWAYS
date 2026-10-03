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
  .object({ kind: z.enum(reportKinds), formId: z.string().uuid().optional() })
  .strict()
const validForm = (body: { kind: string; formId?: string }) =>
  (body.kind === 'SURVEY_FORM_RESULTS') === Boolean(body.formId)
export const reportQuerySchema = reportContext.refine(
  validForm,
  'Survey reports require a form; other reports do not accept one.',
)
export const reportInputSchema = reportContext
  .extend({
    clientRequestId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    format: z.enum(['CSV', 'XLSX', 'XLS', 'PDF']),
  })
  .strict()
  .refine(validForm, 'Survey reports require a form; other reports do not accept one.')
export type ReportKind = (typeof reportKinds)[number]
