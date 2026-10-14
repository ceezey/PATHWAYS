import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { announceStepUpRequired } from '@/lib/auth/beneficiary-step-up-events'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { decodeWorkspaceContext, readWorkspaceContextCookie } from '@/lib/auth/workspace-access'
import { webEnv } from '@/lib/env'
import {
  announceAuthorizationDenied,
  announceWriteCommitted,
} from '@/lib/services/authorized-read-events'
import { ensureSourceInvalidationSubscription } from '@/lib/services/source-mutation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { FormValidationError } from '@/types/pathways'
import { STEP_UP_REQUIRED_CODE } from '@pathways/shared'

export class PathwaysClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'network'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'invalid',
    readonly fieldErrors: FormValidationError[] = [],
    readonly status?: number,
    /** Set when the API requires a recent Beneficiary MFA step-up. */
    readonly stepUpRequired = false,
  ) {
    super(message)
    this.name = 'PathwaysClientError'
  }
}

export async function requestFoundationResponse(
  path: string,
  init: RequestInit = {},
  isCurrent?: () => boolean,
) {
  if (isCurrent && !isCurrent())
    throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  if (typeof window === 'undefined')
    throw new PathwaysClientError('Browser session required.', 'unauthorized')
  ensureSourceInvalidationSubscription()
  const supabase = getBrowserSupabaseClient()
  if (!supabase)
    throw new PathwaysClientError('Authentication is not configured.', 'not_configured')
  // Capture the operation's workspace before asynchronous token acquisition.
  // A singleton account switch must not redirect an already-entered payload.
  const ownerCookie = readWorkspaceContextCookie()
  const ownerGeneration = sensitiveDraftGeneration()
  const { data, error } = await supabase.auth.getSession()
  if (
    ownerCookie !== readWorkspaceContextCookie() ||
    ownerGeneration !== sensitiveDraftGeneration() ||
    (isCurrent && !isCurrent())
  ) {
    throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  }
  const session = data.session
  if (error || !session)
    throw new PathwaysClientError('Current session unavailable.', 'unauthorized')
  const context = decodeWorkspaceContext(ownerCookie, session.user.id)
  if (!context) throw new PathwaysClientError('Workspace context unavailable.', 'forbidden')
  let base: URL
  try {
    base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  } catch {
    throw new PathwaysClientError('API endpoint is not approved.', 'not_configured')
  }
  const isMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData
  const response = await fetch(`${base.toString().replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body != null && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
      'X-Pathways-Organization-Id': context.organizationId,
      'X-Pathways-User-Id': context.userId,
      ...init.headers,
    },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
  if (response.ok && !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()))
    announceWriteCommitted()
  if (!response.ok) {
    let fieldErrors: FormValidationError[] = []
    let serverMessage: string | undefined
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 409 ||
      response.status === 422 ||
      response.status === 503
    ) {
      const body = (await response.json().catch(() => null)) as {
        message?: { errors?: unknown; message?: unknown } | string | unknown[]
        errors?: unknown
        code?: unknown
      } | null
      if (response.status === 403 && body?.code === STEP_UP_REQUIRED_CODE) {
        const stepUp = new PathwaysClientError(
          'Recent MFA verification is required for Beneficiary detail.',
          'forbidden',
          [],
          403,
          true,
        )
        // The error is the denial token, so a reader's own deny() for it is not counted twice.
        announceAuthorizationDenied(stepUp)
        announceStepUpRequired()
        throw stepUp
      }
      const candidate =
        body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
          ? body.message.errors
          : body?.errors
      const candidateMessage =
        typeof body?.message === 'string'
          ? body.message
          : body?.message && !Array.isArray(body.message) && typeof body.message === 'object'
            ? body.message.message
            : Array.isArray(body?.message) &&
                body.message.length > 0 &&
                body.message.every((item) => typeof item === 'string')
              ? // Nest's default ValidationPipe response shape, e.g. from
                // class-validator: { message: string[], error, statusCode }.
                body.message.join(' ')
              : undefined
      if (typeof candidateMessage === 'string' && candidateMessage.length <= 300) {
        serverMessage = candidateMessage
      }
      if (Array.isArray(candidate) && candidate.length <= 100) {
        fieldErrors = candidate.filter(
          (item): item is FormValidationError =>
            typeof item === 'object' &&
            item !== null &&
            'fieldCode' in item &&
            typeof item.fieldCode === 'string' &&
            item.fieldCode.length <= 64 &&
            'code' in item &&
            typeof item.code === 'string' &&
            item.code.length <= 64 &&
            'message' in item &&
            typeof item.message === 'string' &&
            item.message.length <= 300,
        )
      }
    }
    const code =
      response.status === 401
        ? 'unauthorized'
        : response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not_found'
            : response.status === 400 || response.status === 409 || response.status === 422
              ? 'invalid'
              : 'network'
    const failure = new PathwaysClientError(
      fieldErrors.length
        ? 'Review the highlighted form fields.'
        : (serverMessage ?? 'The requested operation could not be completed.'),
      code,
      fieldErrors,
      response.status,
    )
    if (response.status === 401 || response.status === 403) announceAuthorizationDenied(failure)
    throw failure
  }
  return response
}

export async function requestFoundation(
  path: string,
  init: RequestInit = {},
  isCurrent?: () => boolean,
) {
  const response = await requestFoundationResponse(path, init, isCurrent)
  return response.json()
}
