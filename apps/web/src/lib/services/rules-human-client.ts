import * as contract from '@/features/analytics/rules-human-contract'
import { uuidSchema } from '@/features/analytics/rules-validation'
import { contextCookieName } from '@/features/auth/workspace-access'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { PathwaysClientError, requestFoundationResponse } from '@/lib/services/pathways-client'
import type { z } from 'zod'

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
  const cookie = ownerCookie()
  const generation = sensitiveDraftGeneration()
  const current = () =>
    !init.signal?.aborted && generation === sensitiveDraftGeneration() && cookie === ownerCookie()
  if (!cookie || !current())
    throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
  const response = await requestFoundationResponse(path, init)
  if (!current()) throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    throw new PathwaysClientError('The rules response could not be validated.', 'network')
  const payload: unknown = await response.json()
  if (!current()) throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  const parsed = schema.safeParse(payload)
  if (!parsed.success)
    throw new PathwaysClientError('The rules response could not be validated.', 'network')
  return parsed.data
}
async function readRecord<S extends z.ZodTypeAny>(
  id: string,
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.output<S>> {
  const expected = uuidSchema.parse(id)
  const record = await read(path, schema, init)
  if ((record as { id: string }).id !== expected)
    throw new PathwaysClientError('The requested record could not be validated.', 'network')
  return record
}
const idPath = (resource: string, id: string) => `/${resource}/${uuidSchema.parse(id)}`
function query<S extends z.ZodTypeAny>(schema: S, input: z.input<S>) {
  const parsed = schema.parse(input) as Record<string, string | number | undefined>
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(parsed))
    if (value !== undefined) params.set(key, String(value))
  return `?${params}`
}
const post = <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  path: string,
  schema: I,
  output: O,
  body: z.input<I>,
  signal?: AbortSignal,
) => read(path, output, { method: 'POST', body: JSON.stringify(schema.parse(body)), signal })

export const rulesHumanClient = {
  dryRun: (body: z.input<typeof contract.dryRunInputSchema>, signal?: AbortSignal) =>
    post('/rules/dry-run', contract.dryRunInputSchema, contract.dryRunOutputSchema, body, signal),
  listAlerts: (input: z.input<typeof contract.alertListSchema> = {}, signal?: AbortSignal) =>
    read(
      `/alerts${query(contract.alertListSchema, input)}`,
      contract.pageSchema(contract.alertOutputSchema),
      { signal },
    ),
  getAlert: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('alerts', id), contract.alertOutputSchema, { signal }),
  alertHistory: (
    id: string,
    input: z.input<typeof contract.historyListSchema> = {},
    signal?: AbortSignal,
  ) =>
    read(
      `${idPath('alerts', id)}/history${query(contract.historyListSchema, input)}`,
      contract.pageSchema(contract.historyOutputSchema),
      { signal },
    ),
  reviewAlert: (id: string, body: z.input<typeof contract.reviewSchema>, signal?: AbortSignal) =>
    post(
      `${idPath('alerts', id)}/review`,
      contract.reviewSchema,
      contract.alertOutputSchema,
      body,
      signal,
    ),
  dispositionAlert: (
    id: string,
    body: z.input<typeof contract.dispositionSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('alerts', id)}/disposition`,
      contract.dispositionSchema,
      contract.alertOutputSchema,
      body,
      signal,
    ),
  previewAlert: (
    id: string,
    body: z.input<typeof contract.alertPreviewSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('alerts', id)}/outcome-preview`,
      contract.alertPreviewSchema,
      contract.previewOutputSchema,
      body,
      signal,
    ),
  confirmAlert: (
    id: string,
    body: z.input<typeof contract.confirmOutcomeSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('alerts', id)}/outcomes`,
      contract.confirmOutcomeSchema,
      contract.confirmationOutputSchema,
      body,
      signal,
    ),
  listRecommendations: (
    input: z.input<typeof contract.recommendationListSchema> = {},
    signal?: AbortSignal,
  ) =>
    read(
      `/recommendations${query(contract.recommendationListSchema, input)}`,
      contract.pageSchema(contract.recommendationOutputSchema),
      { signal },
    ),
  getRecommendation: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('recommendations', id), contract.recommendationOutputSchema, { signal }),
  reviewRecommendation: (
    id: string,
    body: z.input<typeof contract.reviewSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('recommendations', id)}/review`,
      contract.reviewSchema,
      contract.recommendationOutputSchema,
      body,
      signal,
    ),
  previewRecommendation: (
    id: string,
    body: z.input<typeof contract.recommendationPreviewSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('recommendations', id)}/outcome-preview`,
      contract.recommendationPreviewSchema,
      contract.previewOutputSchema,
      body,
      signal,
    ),
  confirmRecommendation: (
    id: string,
    body: z.input<typeof contract.confirmOutcomeSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('recommendations', id)}/outcomes`,
      contract.confirmOutcomeSchema,
      contract.confirmationOutputSchema,
      body,
      signal,
    ),
  listRules: (input: z.input<typeof contract.ruleListSchema> = {}, signal?: AbortSignal) =>
    read(
      `/rules${query(contract.ruleListSchema, input)}`,
      contract.pageSchema(contract.ruleOutputSchema),
      { signal },
    ),
  getRule: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('rules', id), contract.ruleOutputSchema, { signal }),
  createRule: (body: z.input<typeof contract.createRuleSchema>, signal?: AbortSignal) =>
    post('/rules', contract.createRuleSchema, contract.ruleOutputSchema, body, signal),
  draftRule: (id: string, body: z.input<typeof contract.draftRuleSchema>, signal?: AbortSignal) =>
    post(
      `${idPath('rules', id)}/drafts`,
      contract.draftRuleSchema,
      contract.ruleOutputSchema,
      body,
      signal,
    ),
  activateRule: (
    id: string,
    body: z.input<typeof contract.activateRuleSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('rules', id)}/activate`,
      contract.activateRuleSchema,
      contract.ruleOutputSchema,
      body,
      signal,
    ),
  archiveRule: (
    id: string,
    body: z.input<typeof contract.archiveRuleSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('rules', id)}/archive`,
      contract.archiveRuleSchema,
      contract.ruleOutputSchema,
      body,
      signal,
    ),
  listNotifications: (
    input: z.input<typeof contract.notificationListSchema> = {},
    signal?: AbortSignal,
  ) =>
    read(
      `/notifications${query(contract.notificationListSchema, input)}`,
      contract.pageSchema(contract.notificationOutputSchema),
      { signal },
    ),
  markNotificationRead: (id: string, signal?: AbortSignal) =>
    post(
      `${idPath('notifications', id)}/read`,
      contract.emptyBodySchema,
      contract.notificationOutputSchema,
      {},
      signal,
    ),
}
