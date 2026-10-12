import { PathwaysClientError, requestFoundationResponse } from '@/lib/api/core/request'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { contextCookieName } from '@/lib/auth/workspace-access'
import {
  activateRuleSchema,
  alertListSchema,
  alertOutputSchema,
  alertPreviewSchema,
  archiveRuleSchema,
  confirmOutcomeSchema,
  confirmationOutputSchema,
  createRuleSchema,
  dispositionSchema,
  draftRuleSchema,
  dryRunInputSchema,
  dryRunOutputSchema,
  emptyBodySchema,
  historyListSchema,
  historyOutputSchema,
  notificationListSchema,
  notificationOutputSchema,
  pageSchema,
  previewOutputSchema,
  recommendationListSchema,
  recommendationOutputSchema,
  recommendationPreviewSchema,
  reviewSchema,
  ruleListSchema,
  ruleOutputSchema,
  uuidSchema,
} from '@pathways/shared'
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
  dryRun: (body: z.input<typeof dryRunInputSchema>, signal?: AbortSignal) =>
    post('/rules/dry-run', dryRunInputSchema, dryRunOutputSchema, body, signal),
  listAlerts: (input: z.input<typeof alertListSchema> = {}, signal?: AbortSignal) =>
    read(`/alerts${query(alertListSchema, input)}`, pageSchema(alertOutputSchema), { signal }),
  getAlert: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('alerts', id), alertOutputSchema, { signal }),
  alertHistory: (id: string, input: z.input<typeof historyListSchema> = {}, signal?: AbortSignal) =>
    read(
      `${idPath('alerts', id)}/history${query(historyListSchema, input)}`,
      pageSchema(historyOutputSchema),
      { signal },
    ),
  reviewAlert: (id: string, body: z.input<typeof reviewSchema>, signal?: AbortSignal) =>
    post(`${idPath('alerts', id)}/review`, reviewSchema, alertOutputSchema, body, signal),
  dispositionAlert: (id: string, body: z.input<typeof dispositionSchema>, signal?: AbortSignal) =>
    post(`${idPath('alerts', id)}/disposition`, dispositionSchema, alertOutputSchema, body, signal),
  previewAlert: (id: string, body: z.input<typeof alertPreviewSchema>, signal?: AbortSignal) =>
    post(
      `${idPath('alerts', id)}/outcome-preview`,
      alertPreviewSchema,
      previewOutputSchema,
      body,
      signal,
    ),
  confirmAlert: (id: string, body: z.input<typeof confirmOutcomeSchema>, signal?: AbortSignal) =>
    post(
      `${idPath('alerts', id)}/outcomes`,
      confirmOutcomeSchema,
      confirmationOutputSchema,
      body,
      signal,
    ),
  listRecommendations: (
    input: z.input<typeof recommendationListSchema> = {},
    signal?: AbortSignal,
  ) =>
    read(
      `/recommendations${query(recommendationListSchema, input)}`,
      pageSchema(recommendationOutputSchema),
      { signal },
    ),
  getRecommendation: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('recommendations', id), recommendationOutputSchema, { signal }),
  reviewRecommendation: (id: string, body: z.input<typeof reviewSchema>, signal?: AbortSignal) =>
    post(
      `${idPath('recommendations', id)}/review`,
      reviewSchema,
      recommendationOutputSchema,
      body,
      signal,
    ),
  previewRecommendation: (
    id: string,
    body: z.input<typeof recommendationPreviewSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('recommendations', id)}/outcome-preview`,
      recommendationPreviewSchema,
      previewOutputSchema,
      body,
      signal,
    ),
  confirmRecommendation: (
    id: string,
    body: z.input<typeof confirmOutcomeSchema>,
    signal?: AbortSignal,
  ) =>
    post(
      `${idPath('recommendations', id)}/outcomes`,
      confirmOutcomeSchema,
      confirmationOutputSchema,
      body,
      signal,
    ),
  listRules: (input: z.input<typeof ruleListSchema> = {}, signal?: AbortSignal) =>
    read(`/rules${query(ruleListSchema, input)}`, pageSchema(ruleOutputSchema), { signal }),
  getRule: (id: string, signal?: AbortSignal) =>
    readRecord(id, idPath('rules', id), ruleOutputSchema, { signal }),
  createRule: (body: z.input<typeof createRuleSchema>, signal?: AbortSignal) =>
    post('/rules', createRuleSchema, ruleOutputSchema, body, signal),
  draftRule: (id: string, body: z.input<typeof draftRuleSchema>, signal?: AbortSignal) =>
    post(`${idPath('rules', id)}/drafts`, draftRuleSchema, ruleOutputSchema, body, signal),
  activateRule: (id: string, body: z.input<typeof activateRuleSchema>, signal?: AbortSignal) =>
    post(`${idPath('rules', id)}/activate`, activateRuleSchema, ruleOutputSchema, body, signal),
  archiveRule: (id: string, body: z.input<typeof archiveRuleSchema>, signal?: AbortSignal) =>
    post(`${idPath('rules', id)}/archive`, archiveRuleSchema, ruleOutputSchema, body, signal),
  listNotifications: (input: z.input<typeof notificationListSchema> = {}, signal?: AbortSignal) =>
    read(
      `/notifications${query(notificationListSchema, input)}`,
      pageSchema(notificationOutputSchema),
      { signal },
    ),
  markNotificationRead: (id: string, signal?: AbortSignal) =>
    post(
      `${idPath('notifications', id)}/read`,
      emptyBodySchema,
      notificationOutputSchema,
      {},
      signal,
    ),
}
