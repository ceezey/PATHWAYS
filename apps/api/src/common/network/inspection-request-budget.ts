import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'
import { ServiceUnavailableException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

/** Server-only opt-in; no HTTP selector can supply this capability. */
export interface InspectionRequestBudget {
  readonly signal: AbortSignal
  readonly deadline: number
  remaining(): number
  check(): void
}
const requests = new WeakMap<object, InspectionRequestBudget>()
const identities = new WeakMap<object, { budget: InspectionRequestBudget; sessionId: string }>()
const unavailable = () =>
  new ServiceUnavailableException('Private inspection is temporarily unavailable.')
export const inspectionRequestBudget = (request: object) => requests.get(request)
export const inspectionIdentityContext = (identity: object) => identities.get(identity)
export function bindInspectionIdentity(
  identity: object,
  sessionId: string,
  budget: InspectionRequestBudget,
) {
  budget.check()
  identities.set(identity, Object.freeze({ budget, sessionId }))
}

/** Register app.use before global guard; GET/HEAD only and exact purpose paths. */
export function inspectionBudgetMiddleware(prefix: string) {
  const prefixParts = prefix.split('/').filter(Boolean)
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const parts = (request.url ?? '').split('?')[0].split('/').filter(Boolean)
    const route = parts.slice(prefixParts.length)
    const matched =
      prefixParts.every((part, index) => parts[index] === part) &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      route[0] === 'projects' &&
      route[2] === 'activities' &&
      route[4] === 'updates' &&
      ((route.length === 7 && route[6] === 'inspection-context') ||
        (route.length === 9 && route[6] === 'proof' && route[8] === 'inspection'))
    if (!matched) return next()
    // Context stays at 30 s. A proof transfer verifies, audits and then streams an object of up
    // to EVIDENCE_MAX_FILE_BYTES, so it gets the 90 s ceiling (cr-pathways-activity-progress-media).
    const ceiling = route.length === 9 ? 90_000 : 30_000
    const controller = new AbortController()
    const deadline = performance.now() + ceiling
    const budget: InspectionRequestBudget = Object.freeze({
      signal: controller.signal,
      deadline,
      remaining: () => Math.max(0, Math.floor(deadline - performance.now())),
      check: () => {
        if (controller.signal.aborted || performance.now() >= deadline) throw unavailable()
      },
    })
    requests.set(request, budget)
    const stop = () => {
      controller.abort()
      if (!response.writableFinished) response.destroy()
    }
    const close = () => {
      if (!response.writableFinished) stop()
      cleanup()
    }
    const timer = setTimeout(stop, ceiling)
    timer.unref()
    const cleanup = () => {
      clearTimeout(timer)
      request.removeListener('aborted', stop)
      response.removeListener('close', close)
      response.removeListener('finish', cleanup)
    }
    request.once('aborted', stop)
    response.once('close', close)
    response.once('finish', cleanup)
    if (request.aborted || response.destroyed) {
      stop()
      cleanup()
      return
    }
    next()
  }
}

/** Reserve acquisition separately; do not round an exhausted work window up. */
export function inspectionTransactionPlan(budget: InspectionRequestBudget, workCap: number) {
  budget.check()
  const remaining = budget.remaining()
  if (remaining < 1_001) throw unavailable()
  const maxWait = Math.min(5_000, remaining - 1_000)
  const timeout = Math.min(workCap, remaining - maxWait)
  if (timeout < 1_000) throw unavailable()
  return { maxWait, timeout }
}

/** PG18 candidate only; no global settings, grants or caller-supplied limits. */
export async function setInspectionTransactionBudget(
  tx: Prisma.TransactionClient,
  budget: InspectionRequestBudget,
) {
  budget.check()
  const remaining = budget.remaining()
  if (remaining < 1_000) throw unavailable()
  const transactionMs = String(Math.min(10_000, remaining))
  const statementMs = String(Math.min(1_000, remaining))
  const lockMs = String(Math.min(500, remaining))
  await tx.$queryRaw`SELECT set_config('statement_timeout', ${statementMs}, true),
    set_config('lock_timeout', ${lockMs}, true),
    set_config('transaction_timeout', ${transactionMs}, true)`
  budget.check()
}
