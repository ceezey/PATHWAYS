import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  bindInspectionIdentity,
  inspectionBudgetMiddleware,
  inspectionIdentityContext,
  inspectionRequestBudget,
  inspectionTransactionPlan,
  setInspectionTransactionBudget,
} from './inspection-request-budget'

function request(url: string, method = 'GET') {
  const req = new IncomingMessage(new Socket())
  req.url = url
  req.method = method
  const res = new ServerResponse(req)
  return { req, res }
}
describe('Inspection-only server budget proposal', () => {
  it('starts before next for context/transfer GET and HEAD, ignores ordinary routes', () => {
    for (const method of ['GET', 'HEAD']) {
      const { req, res } = request(
        '/api/projects/p/activities/a/updates/u/proof/e/inspection',
        method,
      )
      let entered = false
      inspectionBudgetMiddleware('api')(req, res, () => {
        entered = true
        expect(inspectionRequestBudget(req)).toBeDefined()
      })
      expect(entered).toBe(true)
      res.emit('finish')
    }
    for (const url of [
      '/api/projects/p',
      '/api/projects/p/activities/a/proof/e',
      '/foreign/projects/p/activities/a/updates/u/inspection-context',
    ]) {
      const { req, res } = request(url)
      inspectionBudgetMiddleware('api')(req, res, () => {})
      expect(inspectionRequestBudget(req)).toBeUndefined()
    }
  })
  it('gives the streamed proof transfer a 90 s ceiling and keeps context at 30 s', () => {
    const remaining = (url: string) => {
      const { req, res } = request(url)
      inspectionBudgetMiddleware('api')(req, res, () => {})
      const value = inspectionRequestBudget(req)?.remaining() ?? 0
      res.emit('finish')
      return value
    }
    const transfer = remaining('/api/projects/p/activities/a/updates/u/proof/e/inspection')
    const context = remaining('/api/projects/p/activities/a/updates/u/inspection-context')
    expect(transfer).toBeGreaterThan(89_000)
    expect(transfer).toBeLessThanOrEqual(90_000)
    expect(context).toBeGreaterThan(29_000)
    expect(context).toBeLessThanOrEqual(30_000)
  })
  it('disconnect aborts before future checks and cannot be supplied by request properties', () => {
    const { req, res } = request('/api/projects/p/activities/a/updates/u/inspection-context')
    Object.assign(req, { inspectionBudget: { remaining: () => 99999 } })
    inspectionBudgetMiddleware('api')(req, res, () => {})
    const budget = inspectionRequestBudget(req)
    if (!budget) throw new Error('Expected server inspection budget')
    req.emit('aborted')
    expect(budget.signal.aborted).toBe(true)
    expect(() => budget.check()).toThrow('Private inspection is temporarily unavailable.')
    res.emit('close')
  })
  it('identity/session is internal, optional and bound only through server registration', () => {
    const identity = { sessionId: 'client-forged' }
    expect(inspectionIdentityContext(identity)).toBeUndefined()
    const controller = new AbortController()
    const budget = {
      signal: controller.signal,
      deadline: 30000,
      remaining: () => 30000,
      check: () => {},
    }
    bindInspectionIdentity(identity, 'server-verified', budget)
    expect(inspectionIdentityContext(identity)?.sessionId).toBe('server-verified')
  })
  it('reserves pool acquisition and minimum work without rounding exhausted time up', () => {
    const budget = (remaining: number) => ({
      signal: new AbortController().signal,
      deadline: remaining,
      remaining: () => remaining,
      check: () => {},
    })
    expect(inspectionTransactionPlan(budget(30000), 10000)).toEqual({
      maxWait: 5000,
      timeout: 10000,
    })
    expect(inspectionTransactionPlan(budget(2000), 10000)).toEqual({ maxWait: 1000, timeout: 1000 })
    expect(() => inspectionTransactionPlan(budget(1000), 10000)).toThrow(
      'Private inspection is temporarily unavailable.',
    )
  })
  it('installs parameterized local nonzero limits before work, rejects late completion', async () => {
    let checked = 0
    const query = vi.fn(async (..._args: unknown[]) => [])
    const budget = {
      signal: new AbortController().signal,
      deadline: 1500,
      remaining: () => 1500,
      check: () => {
        if (++checked === 2) throw new Error('cancelled')
      },
    }
    await expect(
      setInspectionTransactionBudget(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        budget,
      ),
    ).rejects.toThrow('cancelled')
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.slice(1)).toEqual(['1000', '500', '1500'])
  })
})
