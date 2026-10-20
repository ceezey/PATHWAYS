import {
  type RouteDecision,
  type RouteSelection,
  parseRouteSelection,
  routeUuidPattern,
} from '@pathways/shared'
import { approvedApiBaseUrl } from '../api-base-url'

type RouteCheckFailure =
  | 'rejected'
  | 'configuration'
  | 'http'
  | 'invalid-response'
  | 'network'
  | 'timeout'
  | 'cancelled'
export class RouteCheckError extends Error {
  constructor(
    readonly status: number,
    readonly failure: RouteCheckFailure = 'rejected',
  ) {
    super('Current route access could not be verified.')
  }
}
export async function requestRouteCheck(
  base: string,
  token: string,
  context: { userId: string; organizationId: string },
  selection: RouteSelection,
  signal?: AbortSignal,
  trustedBaseUrl?: string,
): Promise<RouteDecision> {
  if (
    !parseRouteSelection(selection) ||
    !routeUuidPattern.test(context.userId) ||
    !routeUuidPattern.test(context.organizationId)
  )
    throw new RouteCheckError(403)
  let target: URL
  try {
    target = approvedApiBaseUrl(base, trustedBaseUrl)
  } catch {
    throw new RouteCheckError(503, 'configuration')
  }
  target.pathname = `${target.pathname.replace(/\/$/, '')}/access/route-check`
  target.search = new URLSearchParams(selection as Record<string, string>).toString()
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort()
  }, 15000)
  const cancellation = () => new RouteCheckError(503, timedOut ? 'timeout' : 'cancelled')
  const checkCancellation = () => {
    if (controller.signal.aborted) throw cancellation()
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  try {
    checkCancellation()
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Pathways-User-Id': context.userId,
        'X-Pathways-Organization-Id': context.organizationId,
      },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    checkCancellation()
    if (!response.ok) throw new RouteCheckError(response.status, 'http')
    let body: unknown
    try {
      body = await response.json()
    } catch {
      checkCancellation()
      throw new RouteCheckError(503, 'invalid-response')
    }
    checkCancellation()
    if (
      !body ||
      typeof body !== 'object' ||
      !('route' in body) ||
      body.route !== selection.route ||
      !('authorization' in body) ||
      body.authorization !== 'database-verified' ||
      !('beneficiaryAccess' in body) ||
      (body.beneficiaryAccess !== 'aggregate-only' &&
        body.beneficiaryAccess !== 'records-or-none') ||
      Object.keys(body).length !== 3
    )
      throw new RouteCheckError(503, 'invalid-response')
    return body as RouteDecision
  } catch (error) {
    if (error instanceof RouteCheckError) throw error
    checkCancellation()
    throw new RouteCheckError(503, 'network')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
