import { contextCookieName } from '@/features/auth/workspace-access'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { z } from 'zod'
import { PathwaysClientError, requestFoundationResponse } from './pathways-client'
import { reportSectionsSchema } from './report-sections'

const ownerCookie = () =>
  typeof document === 'undefined'
    ? null
    : (document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${contextCookieName}=`)) ?? null)
async function read<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.output<S>> {
  const owner = ownerCookie()
  const generation = sensitiveDraftGeneration()
  const current = () =>
    owner !== null &&
    owner === ownerCookie() &&
    generation === sensitiveDraftGeneration() &&
    !init.signal?.aborted
  if (!current())
    throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
  const response = await requestFoundationResponse(path, init)
  if (!current() || !response.headers.get('Content-Type')?.startsWith('application/json')) {
    await response.body?.cancel().catch(() => undefined)
    throw new PathwaysClientError('Response ownership or format changed.', 'unauthorized')
  }
  if (!response.body) throw new PathwaysClientError('Response unavailable.', 'network')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > 2_000_000 || !current())
        throw new PathwaysClientError('Response unavailable.', 'network')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (!current()) throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed.success) throw new PathwaysClientError('Response could not be validated.', 'network')
  return parsed.data
}
const uuid = z.string().uuid()
const path = (id: string) => `/projects/${uuid.parse(id)}`
export const publicationSchema = z
  .object({
    revision: z.number().int().positive(),
    state: z.enum(['FOR_REVIEW', 'APPROVED', 'PUBLISHED']),
    summary: z.string().min(1).max(4000),
    snapshot: z
      .object({
        id: uuid,
        title: z.string().min(1).max(300),
        code: z.string().max(100),
        approvedSummary: z.string().min(1).max(4000),
        area: z.string().max(500).nullable(),
        sector: z.string().max(300).nullable(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
      })
      .strict(),
    submittedById: uuid,
    approvedById: uuid.nullable(),
    publishedById: uuid.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
const publicationReceipt = publicationSchema.pick({ revision: true, state: true, updatedAt: true })
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
export const budgetSchema = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    category: z.string(),
    currency: z.literal('PHP'),
    plannedBudget: decimal,
    remarks: z.string().nullable(),
    updatedAt: timestamp,
  })
  .strict()
export const expenseSchema = z
  .object({
    id: uuid,
    budgetRecordId: uuid,
    description: z.string(),
    amount: decimal,
    expenseDate: z.string(),
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    receiptEvidenceId: uuid.nullable(),
    submittedById: uuid,
    verifiedById: uuid.nullable(),
    approvedById: uuid.nullable(),
    updatedAt: timestamp,
    signedOffById: uuid.nullable(),
    signedOffAt: timestamp.nullable(),
  })
  .strict()
export const expenseAck = z
  .object({
    id: uuid,
    projectId: uuid,
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    updatedAt: timestamp,
    receiptEvidenceId: uuid.nullable(),
  })
  .strict()
const reportKind = z.enum([
  'PROJECT_SUMMARY',
  'INDICATOR_SUMMARY',
  'BENEFICIARY_SUMMARY',
  'SURVEY_FORM_RESULTS',
  'MONITORING_REPORT',
  'EVALUATION_REPORT',
])
const reportFormat = z.enum(['CSV', 'XLSX', 'XLS', 'PDF'])
export const reportPreviewSchema = z
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
  })
  .strict()
const post = <S extends z.ZodTypeAny>(url: string, schema: S, body: unknown) =>
  read(url, schema, { method: 'POST', body: JSON.stringify(body) })
const criterionSchema = z
  .object({
    id: uuid,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: z.enum([
      'KPI',
      'TIMELINE_COMPLIANCE',
      'BUDGET_EFFICIENCY',
      'BENEFICIARY_REACH',
      'INDICATOR_LINKAGE',
      'ASSESSMENT_GAIN',
      'OTHER',
    ]),
    version: z.number().int(),
    weightPercentage: decimal,
    maximumScore: decimal,
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    updatedAt: timestamp,
  })
  .strict()
const evaluationPersonSchema = z.object({ id: uuid, name: z.string() }).strict().nullable()
const criterionSnapshotSchema = z
  .object({
    id: uuid,
    code: z.string(),
    version: z.number().int(),
    type: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    weight_percentage: z.string(),
    maximum_score: z.string(),
  })
  .strict()
const evaluationScoreSchema = z
  .object({
    criterionId: uuid,
    score: decimal,
    maximumScore: decimal,
    weightedScore: decimal,
    source: z.enum(['computed', 'no_data', 'manual']),
    evidence: z.string().nullable(),
    reason: z.string().nullable(),
    note: z.string().nullable(),
    criterion: criterionSnapshotSchema,
  })
  .strict()
export const evaluationDetailSchema = z
  .object({
    id: uuid,
    title: z.string(),
    periodLabel: z.string().nullable(),
    periodStart: z.string(),
    periodEnd: z.string(),
    overallScore: decimal.nullable(),
    commentary: z.string().nullable(),
    returnReason: z.string().nullable(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']),
    updatedAt: timestamp,
    evaluatedBy: evaluationPersonSchema,
    evaluatedAt: timestamp.nullable(),
    reviewedBy: evaluationPersonSchema,
    reviewedAt: timestamp.nullable(),
    reviewFeedback: z.string().nullable(),
    signedOffBy: evaluationPersonSchema,
    signedOffAt: timestamp.nullable(),
    scores: z.array(evaluationScoreSchema).max(100),
  })
  .strict()
export const evaluationSchema = z
  .object({
    projectId: uuid,
    criteria: z.array(criterionSchema).max(100),
    evaluations: z.array(evaluationDetailSchema).max(20),
    hasMore: z.boolean(),
  })
  .strict()
const auditSchema = z
  .object({
    id: uuid,
    occurredAt: timestamp,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    projectId: uuid.nullable(),
    actorUserId: uuid.nullable(),
    actorName: z.string().nullable(),
  })
  .strict()
export const coreDataClient = {
  budgets: (id: string, signal?: AbortSignal) =>
    read(`${path(id)}/finance/budgets`, z.array(budgetSchema).max(100), { signal }),
  createBudget: (id: string, body: unknown) =>
    post(
      `${path(id)}/finance/budgets`,
      z.object({ id: uuid, updatedAt: timestamp }).strict(),
      body,
    ),
  replaceBudget: (id: string, budgetId: string, body: unknown) =>
    read(
      `${path(id)}/finance/budgets/${uuid.parse(budgetId)}`,
      z.object({ id: uuid, updatedAt: timestamp }).strict(),
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  expenses: (id: string, signal?: AbortSignal) =>
    read(`${path(id)}/finance/expenses`, z.array(expenseSchema).max(100), { signal }),
  budgetReferences: (id: string, signal?: AbortSignal) =>
    read(
      `${path(id)}/finance/expense-budget-references`,
      z
        .array(z.object({ id: uuid, category: z.string(), activityId: uuid.nullable() }).strict())
        .max(100),
      { signal },
    ),
  submitExpense: (id: string, body: unknown) =>
    post(
      `${path(id)}/finance/expenses`,
      expenseAck.refine((row) => row.projectId === id),
      body,
    ),
  reviewExpense: (id: string, expenseId: string, body: unknown) =>
    post(
      `${path(id)}/finance/expenses/${uuid.parse(expenseId)}/review`,
      expenseAck.refine((row) => row.projectId === id && row.id === expenseId),
      body,
    ),
  signoffExpense: (id: string, expenseId: string) =>
    post(
      `${path(id)}/finance/expenses/${uuid.parse(expenseId)}/signoff`,
      z
        .object({ expenseId: uuid, signedOffById: uuid, signedOffAt: timestamp })
        .strict()
        .refine((row) => row.expenseId === expenseId),
      {},
    ),
  uploadReceipt: (id: string, expenseId: string, updatedAt: string, file: File) => {
    const data = new FormData()
    data.append('expectedUpdatedAt', timestamp.parse(updatedAt))
    data.append('file', file)
    return read(
      `${path(id)}/finance/expenses/${uuid.parse(expenseId)}/receipt`,
      expenseAck.refine((row) => row.projectId === id && row.id === expenseId),
      {
        method: 'POST',
        body: data,
      },
    )
  },
  surveyForms: (id: string, signal?: AbortSignal) =>
    read(
      `${path(id)}/reports/survey-forms`,
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
  reportPreview: (
    id: string,
    kind: z.infer<typeof reportKind>,
    signal?: AbortSignal,
    formId?: string,
  ) =>
    read(
      `${path(id)}/reports/preview?kind=${reportKind.parse(kind)}${formId ? `&formId=${uuid.parse(formId)}` : ''}`,
      reportPreviewSchema.refine(
        (row) => row.projectId === id && row.kind === kind && row.formId === (formId ?? null),
      ),
      {
        signal,
      },
    ),
  reports: (id: string, signal?: AbortSignal) =>
    read(`${path(id)}/reports`, z.array(reportSchema).max(100), { signal }),
  generateReport: (
    id: string,
    body: {
      clientRequestId: string
      name: string
      kind: z.infer<typeof reportKind>
      format: z.infer<typeof reportFormat>
      formId?: string
    },
  ) =>
    post(
      `${path(id)}/reports`,
      z.object({ id: uuid, status: z.literal('GENERATED') }).strict(),
      body,
    ),
  evaluation: (id: string, signal?: AbortSignal) =>
    read(
      `${path(id)}/evaluation`,
      evaluationSchema.refine((row) => row.projectId === id),
      { signal },
    ),
  createEvaluation: (id: string, body: unknown) =>
    post(`${path(id)}/evaluation/evaluations`, evaluationDetailSchema, body),
  saveEvaluationScores: (id: string, evaluationId: string, body: unknown) =>
    read(
      `${path(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/scores`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  submitEvaluation: (id: string, evaluationId: string, body: unknown) =>
    post(
      `${path(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/submit`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  returnEvaluation: (id: string, evaluationId: string, body: unknown) =>
    post(
      `${path(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/return`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  signoffEvaluation: (id: string, evaluationId: string, body: unknown) =>
    post(
      `${path(id)}/evaluation/evaluations/${uuid.parse(evaluationId)}/signoff`,
      evaluationDetailSchema.refine((row) => row.id === evaluationId),
      body,
    ),
  audit: (cursor?: string, signal?: AbortSignal) =>
    read(
      `/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      z.object({ rows: z.array(auditSchema).max(100), nextCursor: z.string().nullable() }).strict(),
      { signal },
    ),
}

export type CoreArtifact = { blob: Blob; fileName: string }

/** Fetches an artifact as a typed Blob under the same owner and size checks as a download. */
export async function fetchCoreArtifact(
  url: string,
  fileName: string,
  isOwnerCurrent: () => boolean = () => true,
): Promise<CoreArtifact> {
  const owner = ownerCookie()
  const generation = sensitiveDraftGeneration()
  const current = () =>
    isOwnerCurrent() &&
    owner !== null &&
    owner === ownerCookie() &&
    generation === sensitiveDraftGeneration()
  if (!current() || !/^[a-z0-9-]+\.(csv|xlsx|xls|pdf|png|jpg)$/.test(fileName))
    throw new PathwaysClientError('Current artifact access is required.', 'unauthorized')
  const response = await requestFoundationResponse(url, { signal: AbortSignal.timeout(20000) })
  if (!current() || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
  }
  const mime = response.headers.get('Content-Type')?.split(';')[0]
  if (
    !mime ||
    ![
      'text/csv',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
    ].includes(mime)
  ) {
    await response.body.cancel().catch(() => undefined)
    throw new PathwaysClientError('Artifact format unavailable.', 'network')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let count = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      count += part.value.length
      if (count > 10485760 || !current())
        throw new PathwaysClientError('Artifact unavailable.', 'network')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (!current() || count === 0)
    throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
  const bytes = new Uint8Array(count)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const extensions: Record<string, string> = {
    'text/csv': 'csv',
    'application/pdf': 'pdf',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/png': 'png',
    'image/jpeg': 'jpg',
  }
  return {
    blob: new Blob([bytes], { type: mime }),
    fileName: fileName.replace(/\.[a-z0-9]+$/, `.${extensions[mime]}`),
  }
}

/** Saves an already fetched artifact through a short-lived object URL. */
export function saveCoreArtifact(
  artifact: CoreArtifact,
  isOwnerCurrent: () => boolean = () => true,
) {
  const objectUrl = URL.createObjectURL(artifact.blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = artifact.fileName
  try {
    if (!isOwnerCurrent())
      throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

export async function downloadCoreArtifact(
  url: string,
  fileName: string,
  isOwnerCurrent: () => boolean = () => true,
) {
  saveCoreArtifact(await fetchCoreArtifact(url, fileName, isOwnerCurrent), isOwnerCurrent)
}
export const coreFeatureClient = {
  publication: (id: string, signal?: AbortSignal) =>
    read(
      `${path(id)}/publication`,
      publicationSchema.refine((row) => row.snapshot.id === id).nullable(),
      { signal },
    ),
  transitionPublication: (
    id: string,
    operation: 'submit' | 'approve' | 'publish' | 'withdraw',
    body: { clientRequestId: string; expectedRevision: number; summary?: string },
    signal?: AbortSignal,
  ) =>
    read(`${path(id)}/publication/${operation}`, publicationReceipt, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
}
