import type {
  CreateBudgetRequest,
  ReplaceBudgetRequest,
  ReviewExpenseRequest,
  SubmitExpenseRequest,
} from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { coreDataClient } from '@/lib/services/core-feature-client'
import { financeClient } from './finance'

const authUserId = '78000000-0000-4000-8000-000000000001'
const organizationId = '78000000-0000-4000-8000-000000000002'
const userId = '78000000-0000-4000-8000-000000000003'
const projectId = '78000000-0000-4000-8000-000000000004'
const expenseId = '78000000-0000-4000-8000-000000000005'
const otherId = '78000000-0000-4000-8000-000000000006'
const budgetId = '78000000-0000-4000-8000-000000000009'
const updatedAt = '2026-09-27T00:00:00.000Z'
const acknowledgement = {
  id: expenseId,
  projectId,
  status: 'PENDING',
  updatedAt,
  receiptEvidenceId: null,
}
const budget = {
  id: budgetId,
  activityId: null,
  category: 'Training',
  currency: 'PHP',
  plannedBudget: '1000.00',
  remarks: null,
  updatedAt,
}
const expense = {
  id: expenseId,
  budgetRecordId: budgetId,
  description: 'Fictional delivery',
  amount: '125.00',
  expenseDate: '2026-09-01',
  status: 'PENDING',
  receiptEvidenceId: null,
  submittedById: userId,
  verifiedById: null,
  approvedById: null,
  updatedAt,
  signedOffById: null,
  signedOffAt: null,
  submittedByName: null,
  verifiedByName: null,
  approvedByName: null,
  signedOffByName: null,
}
const createBody: CreateBudgetRequest = { category: 'Training', plannedBudget: '1000.00' }
const replaceBody: ReplaceBudgetRequest = { ...createBody, expectedUpdatedAt: updatedAt }
const submitBody: SubmitExpenseRequest = {
  clientRequestId: otherId,
  budgetRecordId: budgetId,
  description: 'Fictional delivery',
  amount: '125.00',
  expenseDate: '2026-09-01',
}
const reviewBody: ReviewExpenseRequest = {
  expectedUpdatedAt: updatedAt,
  decision: 'VERIFY',
  stage: 'VERIFY',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The same cases run against the old coreDataClient and the new financeClient.
const clients = [
  ['coreDataClient', coreDataClient],
  ['financeClient', financeClient],
] as const
type Client = (typeof clients)[number][1]
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'budgets',
    (c, id, signal) => c.budgets(id, signal),
    '/finance/budgets',
    'GET',
    undefined,
    [budget],
    true,
  ],
  [
    'createBudget',
    (c, id) => c.createBudget(id, createBody),
    '/finance/budgets',
    'POST',
    JSON.stringify(createBody),
    { id: budgetId, updatedAt },
    false,
  ],
  [
    'replaceBudget',
    (c, id) => c.replaceBudget(id, budgetId, replaceBody),
    `/finance/budgets/${budgetId}`,
    'PATCH',
    JSON.stringify(replaceBody),
    { id: budgetId, updatedAt },
    false,
  ],
  [
    'expenses',
    (c, id, signal) => c.expenses(id, signal),
    '/finance/expenses',
    'GET',
    undefined,
    [expense],
    true,
  ],
  [
    'budgetReferences',
    (c, id, signal) => c.budgetReferences(id, signal),
    '/finance/expense-budget-references',
    'GET',
    undefined,
    [{ id: budgetId, category: 'Training', activityId: null }],
    true,
  ],
  [
    'submitExpense',
    (c, id) => c.submitExpense(id, submitBody),
    '/finance/expenses',
    'POST',
    JSON.stringify(submitBody),
    acknowledgement,
    false,
  ],
  [
    'reviewExpense',
    (c, id) => c.reviewExpense(id, expenseId, reviewBody),
    `/finance/expenses/${expenseId}/review`,
    'POST',
    JSON.stringify(reviewBody),
    acknowledgement,
    false,
  ],
  [
    'signoffExpense',
    (c, id) => c.signoffExpense(id, expenseId),
    `/finance/expenses/${expenseId}/signoff`,
    'POST',
    '{}',
    { expenseId, signedOffById: userId, signedOffAt: updatedAt },
    false,
  ],
  [
    'uploadReceipt',
    (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
    `/finance/expenses/${expenseId}/receipt`,
    'POST',
    expect.any(FormData),
    acknowledgement,
    false,
  ],
]

describe.each(clients)('%s requests', (_name, client) => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}${suffix}`)
      expect(init?.method ?? 'GET').toBe(method)
      expect(init?.body).toEqual(body)
      expect(init?.signal).toBe(readsSignal ? controller.signal : undefined)
    },
  )
  it.each(requests)(
    '%s rejects a response with an unknown key',
    async (_member, call, _suffix, _method, _body, response) => {
      fetcher.mockResolvedValueOnce(
        json(
          Array.isArray(response)
            ? response.map((row) => ({ ...row, extra: 'x' }))
            : { ...(response as object), extra: 'x' },
        ),
      )
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(client, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends a receipt as a multipart form without a JSON content type', async () => {
    fetcher.mockResolvedValueOnce(json(acknowledgement))
    await client.uploadReceipt(
      projectId,
      expenseId,
      updatedAt,
      new File(['synthetic'], 'receipt.pdf'),
    )
    const init = fetcher.mock.calls[0][1]
    const form = init?.body as FormData
    expect(form.get('expectedUpdatedAt')).toBe(updatedAt)
    expect((form.get('file') as File).name).toBe('receipt.pdf')
    expect(init?.headers).not.toHaveProperty('Content-Type')
  })
  it.each([
    ['replaceBudget', (c, id) => c.replaceBudget(id, 'not-a-uuid', replaceBody)],
    ['reviewExpense', (c, id) => c.reviewExpense(id, 'not-a-uuid', reviewBody)],
    ['signoffExpense', (c, id) => c.signoffExpense(id, 'not-a-uuid')],
    [
      'uploadReceipt',
      (c, id) =>
        c.uploadReceipt(id, 'not-a-uuid', updatedAt, new File(['synthetic'], 'receipt.pdf')),
    ],
    [
      'uploadReceipt time',
      (c, id) =>
        c.uploadReceipt(id, expenseId, 'yesterday', new File(['synthetic'], 'receipt.pdf')),
    ],
  ] as readonly (readonly [string, Call])[])(
    '%s refuses a malformed record id or time before any request',
    (_member, call) => {
      expect(() => call(client, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['more than 100 budgets', (c, id) => c.budgets(id), Array.from({ length: 101 }, () => budget)],
    [
      'more than 100 expenses',
      (c, id) => c.expenses(id),
      Array.from({ length: 101 }, () => expense),
    ],
    [
      'more than 100 budget references',
      (c, id) => c.budgetReferences(id),
      Array.from({ length: 101 }, () => ({ id: budgetId, category: 'Training', activityId: null })),
    ],
    [
      'a budget in a currency other than PHP',
      (c, id) => c.budgets(id),
      [{ ...budget, currency: 'USD' }],
    ],
    [
      'a planned budget that is not a decimal',
      (c, id) => c.budgets(id),
      [{ ...budget, plannedBudget: '1e3' }],
    ],
    [
      'an expense status outside the catalog',
      (c, id) => c.expenses(id),
      [{ ...expense, status: 'PAID' }],
    ],
    [
      'a person name over 200 characters',
      (c, id) => c.expenses(id),
      [{ ...expense, submittedByName: 'x'.repeat(201) }],
    ],
    [
      'an expense update time that is not a timestamp',
      (c, id) => c.expenses(id),
      [{ ...expense, updatedAt: 'yesterday' }],
    ],
    [
      'a budget create acknowledgement with a bad time',
      (c, id) => c.createBudget(id, createBody),
      { id: budgetId, updatedAt: 'yesterday' },
    ],
    [
      'an acknowledgement status outside the catalog',
      (c, id) => c.submitExpense(id, submitBody),
      { ...acknowledgement, status: 'PAID' },
    ],
    [
      'a receipt acknowledgement for another project',
      (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a submit acknowledgement for another project',
      (c, id) => c.submitExpense(id, submitBody),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a review acknowledgement for another project',
      (c, id) => c.reviewExpense(id, expenseId, reviewBody),
      { ...acknowledgement, projectId: otherId },
    ],
    [
      'a review acknowledgement for another expense',
      (c, id) => c.reviewExpense(id, expenseId, reviewBody),
      { ...acknowledgement, id: otherId },
    ],
    [
      'a receipt acknowledgement for another expense',
      (c, id) => c.uploadReceipt(id, expenseId, updatedAt, new File(['synthetic'], 'receipt.pdf')),
      { ...acknowledgement, id: otherId },
    ],
    [
      'a sign-off for another expense',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId: otherId, signedOffById: userId, signedOffAt: updatedAt },
    ],
    [
      'a sign-off by a malformed person id',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId, signedOffById: 'someone', signedOffAt: updatedAt },
    ],
    [
      'a sign-off with a malformed time',
      (c, id) => c.signoffExpense(id, expenseId),
      { expenseId, signedOffById: userId, signedOffAt: 'yesterday' },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'rejects %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(client, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it('accepts a rejected expense and exactly 100 budgets', async () => {
    const rejectedExpense = { ...expense, status: 'REJECTED' }
    fetcher.mockResolvedValueOnce(json([rejectedExpense]))
    await expect(client.expenses(projectId)).resolves.toEqual([rejectedExpense])
    fetcher.mockResolvedValueOnce(json(Array.from({ length: 100 }, () => budget)))
    await expect(client.budgets(projectId)).resolves.toHaveLength(100)
  })
})
