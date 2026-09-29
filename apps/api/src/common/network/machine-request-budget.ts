import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'

export interface MachineRequestEntry {
  readonly enteredAt: number
  readonly deadlineAt: number
  readonly signal: AbortSignal
  remainingMs(): number
  check(): void
}
const entries = new WeakMap<object, MachineRequestEntry>()
export const machineRequestEntry = (request: object) => entries.get(request)

/** Timing only: never authenticates, installs a capability or reads scope.
 * Install app.use before Nest init/listen registers its body parser. Trusted
 * test seams are not environment options; production uses fixed25 seconds. */
export function machineBudgetMiddleware(
  prefix: string,
  test?: Readonly<{ durationMs?: number; now?: () => number }>,
) {
  const duration = test?.durationMs ?? 25_000
  if (!Number.isInteger(duration) || duration <= 0 || duration > 25_000)
    throw Error('Invalid machine request budget')
  const now = test?.now ?? performance.now.bind(performance)
  const base = `/${[...prefix.split('/').filter(Boolean), 'internal', 'rules'].join('/')}`
  const routes = new Set([`${base}/drain`, `${base}/sweep`])
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const enteredAt = now()
    const raw = request.url ?? ''
    let namespace = false
    try {
      const decoded = decodeURIComponent(raw.split('?')[0] ?? '')
      const normalized = new URL(`http://127.0.0.1${decoded}`).pathname
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .toLowerCase()
      namespace =
        normalized === base.toLowerCase() || normalized.startsWith(`${base.toLowerCase()}/`)
    } catch {
      namespace = raw.toLowerCase().includes(base.toLowerCase())
    }
    if (!namespace) return next()
    response.setHeader('Cache-Control', 'private, no-store')
    if (request.method !== 'POST' || !routes.has(raw)) {
      response.statusCode = 403
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Connection', 'close')
      response.end(
        JSON.stringify({
          message: 'Rule processing is unavailable.',
          error: 'Forbidden',
          statusCode: 403,
        }),
      )
      return
    }
    const deadlineAt = enteredAt + duration
    const controller = new AbortController()
    const entry: MachineRequestEntry = Object.freeze({
      enteredAt,
      deadlineAt,
      signal: controller.signal,
      remainingMs: () => Math.max(0, Math.floor(deadlineAt - now())),
      check: () => {
        if (controller.signal.aborted || now() >= deadlineAt)
          throw Error('Rule processing is unavailable.')
      },
    })
    entries.set(request, entry)
    const cleanup = () => {
      clearTimeout(timer)
      request.removeListener('aborted', stop)
      response.removeListener('close', close)
      response.removeListener('finish', cleanup)
      entries.delete(request)
      controller.abort()
    }
    const stop = () => {
      cleanup()
      if (!response.writableFinished) response.destroy()
    }
    const close = () => {
      if (!response.writableFinished) stop()
      else cleanup()
    }
    const timer = setTimeout(stop, Math.max(1, Math.ceil(deadlineAt - now())))
    timer.unref()
    request.once('aborted', stop)
    response.once('close', close)
    response.once('finish', cleanup)
    if (request.aborted || response.destroyed) {
      stop()
      return
    }
    next()
  }
}
