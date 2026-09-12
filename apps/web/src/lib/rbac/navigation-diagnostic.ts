import { AuthAccessError } from '../../features/auth/auth-access'
import { RouteCheckError } from './route-access'

const boundaries = ['MIDDLEWARE', 'SERVER_PAGE'] as const
const stages = [
  'CONFIGURATION',
  'CLAIMS',
  'IDENTITY',
  'ASSURANCE',
  'CONTEXT',
  'SESSION',
  'PROFILE',
  'ROUTE_POLICY',
  'ROUTE_API',
] as const
export type NavigationStage = (typeof stages)[number]

// Operational diagnostics only, not request logs or authorization state. Never
// serialize an error, URL, header, cookie, claim, selector, or API response body.
// Both callers run on the web server; nothing is added to the redirect/cookies.
export function recordNavigationDenial(
  boundary: (typeof boundaries)[number],
  stage: NavigationStage,
  error?: unknown,
) {
  if (process.env.NODE_ENV !== 'development' || typeof window !== 'undefined') return
  let reason = 'CHECK_REJECTED'
  if (error !== undefined) {
    reason = 'UNEXPECTED_FAILURE'
    if (error instanceof AuthAccessError || error instanceof RouteCheckError) {
      const status = Object.getOwnPropertyDescriptor(error, 'status')?.value
      const failure =
        error instanceof RouteCheckError
          ? Object.getOwnPropertyDescriptor(error, 'failure')?.value
          : 'http'
      if (error instanceof RouteCheckError && failure !== 'http') {
        const reasons: Record<string, string> = {
          rejected: 'CHECK_REJECTED',
          configuration: 'CONFIGURATION',
          'invalid-response': 'INVALID_RESPONSE',
          network: 'NETWORK',
          timeout: 'TIMEOUT',
          cancelled: 'CANCELLED',
        }
        reason =
          typeof failure === 'string' && Object.hasOwn(reasons, failure)
            ? reasons[failure]
            : 'CHECK_FAILED'
      } else if ([401, 403, 404, 429, 500, 502, 503, 504].includes(status))
        reason = `HTTP_${status}`
      else if (Number.isInteger(status) && status >= 500 && status <= 599) reason = 'HTTP_5XX'
      else if (status === 'network') reason = 'NETWORK'
      else if (status === 'timeout') reason = 'TIMEOUT'
      else reason = 'CHECK_FAILED'
    }
  }
  try {
    console.warn('PATHWAYS_NAVIGATION_DENIED', {
      boundary: boundaries.includes(boundary) ? boundary : 'UNKNOWN',
      stage: stages.includes(stage) ? stage : 'UNKNOWN',
      reason,
    })
  } catch {
    // Diagnostics must never turn a denied request into an allowed one or
    // prevent the existing fail-closed redirect if the output sink fails.
  }
}
