import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'

const authDurations = new WeakMap<object, number>()

/** Records the guard duration for one request; durations only, never identities or values. */
export function markAuthDuration(request: object, durationMs: number) {
  authDurations.set(request, durationMs)
}

/** Formats the auth and total metrics as Server-Timing entries. */
export function serverTimingMetrics(authMs: number | undefined, totalMs: number) {
  const metric = (name: string, ms: number) => `${name};dur=${Math.max(0, Math.round(ms))}`
  return [...(authMs === undefined ? [] : [metric('auth', authMs)]), metric('total', totalMs)].join(
    ', ',
  )
}

/** Adds auth and total Server-Timing metrics to every response, keeping any existing value. */
export function serverTimingMiddleware(now: () => number = performance.now.bind(performance)) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const startedAt = now()
    const writeHead = response.writeHead.bind(response) as (...args: unknown[]) => ServerResponse
    response.writeHead = ((...args: unknown[]) => {
      if (!response.headersSent) {
        const metrics = serverTimingMetrics(authDurations.get(request), now() - startedAt)
        const existing = response.getHeader('Server-Timing')
        response.setHeader('Server-Timing', existing ? `${String(existing)}, ${metrics}` : metrics)
      }
      return writeHead(...args)
    }) as typeof response.writeHead
    next()
  }
}
