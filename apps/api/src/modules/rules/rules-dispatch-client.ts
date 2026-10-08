import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type { RulesDispatcherEnv } from '@pathways/config'

type DispatchPurpose = 'DRAIN' | 'SWEEP'
const DRAIN_INTERVAL_MS = 300_000
const SWEEP_INTERVAL_MS = 3_600_000
const REQUEST_TIMEOUT_MS = 30_000
const RESPONSE_LIMIT_BYTES = 1024
const unavailable = () => new Error('Rules dispatch is temporarily unavailable.')

export async function dispatchRulesOnce(
  options: RulesDispatcherEnv,
  purpose: DispatchPurpose,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (purpose !== 'DRAIN' && purpose !== 'SWEEP') throw unavailable()
  const url = `${options.RULES_DISPATCH_API_BASE_URL.replace(/\/$/, '')}/internal/rules/${purpose === 'DRAIN' ? 'drain' : 'sweep'}`
  const token = purpose === 'DRAIN' ? options.RULES_DRAIN_TOKEN : options.RULES_SWEEP_TOKEN
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.any([
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(signal ? [signal] : []),
      ]),
    })
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel()
      throw unavailable()
    }
    const reader = response.body.getReader()
    let bytes = 0
    const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > RESPONSE_LIMIT_BYTES) {
          await reader.cancel()
          throw unavailable()
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    const decoded = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      Array.isArray(decoded) ||
      Object.keys(decoded).length !== 1 ||
      !('state' in decoded) ||
      decoded.state !== 'ACKNOWLEDGED'
    )
      throw unavailable()
    if (signal?.aborted) throw unavailable()
  } catch {
    throw unavailable()
  }
}

// The production cadence is fixed. Injected clock/transport are trusted test
// adapters; neither HTTP requests nor environment values select timing budgets.
interface DispatcherRuntime {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  dispatch(
    options: RulesDispatcherEnv,
    purpose: DispatchPurpose,
    signal: AbortSignal,
  ): Promise<void>
  failed(): void
}
export async function runRulesDispatcher(
  options: RulesDispatcherEnv,
  signal: AbortSignal,
  runtime: DispatcherRuntime = {
    now: () => performance.now(),
    sleep: async (ms, aborted) => {
      await delay(ms, undefined, { signal: aborted })
    },
    dispatch: dispatchRulesOnce,
    failed: () => {
      console.error('Rules dispatch is temporarily unavailable.')
    },
  },
) {
  let drainAt = runtime.now()
  let sweepAt = drainAt
  while (!signal.aborted) {
    if (runtime.now() >= drainAt) {
      try {
        await runtime.dispatch(options, 'DRAIN', signal)
      } catch {
        if (!signal.aborted) runtime.failed()
      }
      drainAt = runtime.now() + DRAIN_INTERVAL_MS
    }
    if (!signal.aborted && runtime.now() >= sweepAt) {
      try {
        await runtime.dispatch(options, 'SWEEP', signal)
      } catch {
        if (!signal.aborted) runtime.failed()
      }
      sweepAt = runtime.now() + SWEEP_INTERVAL_MS
    }
    if (signal.aborted) break
    try {
      await runtime.sleep(Math.max(1, Math.min(drainAt, sweepAt) - runtime.now()), signal)
    } catch {
      if (!signal.aborted) throw unavailable()
    }
  }
}
