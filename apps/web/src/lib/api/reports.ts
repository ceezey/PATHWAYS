import {
  type GenerateReportRequest,
  evaluationRoundResponse,
  generateReportResponse,
  reportKinds,
  reportPreviewResponse,
  reportResponse,
  surveyFormResponse,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

const uuid = z.guid()
const reportKind = z.enum(reportKinds)
// The stored report type also holds OTHER and the stored round status holds open states, so the client narrows both.
const reportSchema = reportResponse.extend({ type: reportKind })
const evaluationRoundSchema = evaluationRoundResponse.extend({
  status: z.enum(['SIGNED_OFF', 'ARCHIVED']),
})
export const reportsClient = {
  surveyForms: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/reports/survey-forms`, z.array(surveyFormResponse).max(100), {
      signal,
    }),
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
      reportPreviewResponse.refine(
        (row) => row.projectId === id && row.kind === kind && row.formId === (formId ?? null),
      ),
      {
        signal,
      },
    ),
  reports: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/reports`, z.array(reportSchema).max(100), { signal }),
  generateReport: (id: string, body: GenerateReportRequest) =>
    ownedJsonPost(`${projectPath(id)}/reports`, generateReportResponse, body),
}
