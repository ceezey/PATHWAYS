import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_METADATA_BYTES = 16 * 1024
const STORAGE_DEADLINE_MS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PrivateInspectionReadError extends Error {
  constructor() {
    super('Private inspection storage is unavailable.')
    this.name = 'PrivateInspectionReadError'
  }
}

export interface PrivateInspectionStorageConfig {
  serviceOrigin: string
  serviceRoleKey: string
  evidenceBucket: string
}

// Every field is internal authorized context, never an HTTP path/choice/DTO.
export interface AuthorizedPrivateInspectionObject {
  organizationId: string
  projectId: string
  evidenceId: string
  bucket: string
  objectKey: string
  expectedBytes: number
  expectedSha256: string
  signal: AbortSignal
  // Monotonic deadline from the caller's complete-request controller.
  deadlineMonotonicMs: number
}

type Reader = (input: AuthorizedPrivateInspectionObject) => Promise<Buffer>
interface Dependencies {
  fetch: typeof fetch
  now: () => number
}

const unavailable = (): never => {
  throw new PrivateInspectionReadError()
}
// biome-ignore lint/suspicious/noControlCharactersInRegex: Deny unsafe object-path controls.
const unsafePathSegment = /[\u0000-\u001f\u007f\\]/
// biome-ignore lint/suspicious/noControlCharactersInRegex: Deny credential controls and whitespace.
const unsafeCredential = /[\u0000-\u0020\u007f]/
const safeSegment = (value: string) =>
  value.length > 0 && value !== '.' && value !== '..' && !unsafePathSegment.test(value)
const cancelBody = (body: ReadableStream<Uint8Array> | null) => {
  if (body) void body.cancel().catch(() => undefined)
}

function buildReader(
  configuration: PrivateInspectionStorageConfig,
  suppliedDependencies: Dependencies,
): Reader {
  const dependencies = { fetch: suppliedDependencies.fetch, now: suppliedDependencies.now }
  let config: PrivateInspectionStorageConfig
  try {
    config = {
      serviceOrigin: configuration.serviceOrigin,
      serviceRoleKey: configuration.serviceRoleKey,
      evidenceBucket: configuration.evidenceBucket,
    }
  } catch {
    return unavailable()
  }
  if (
    typeof config.serviceOrigin !== 'string' ||
    typeof config.serviceRoleKey !== 'string' ||
    typeof config.evidenceBucket !== 'string'
  )
    return unavailable()
  let origin: URL
  try {
    origin = new URL(config.serviceOrigin)
  } catch {
    return unavailable()
  }
  const expectedProtocol = 'https:'
  const rawRootOnly = /^https:\/\/[^/?#]+\/?$/
  if (
    origin.protocol !== expectedProtocol ||
    !rawRootOnly.test(config.serviceOrigin) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    !safeSegment(config.evidenceBucket) ||
    config.evidenceBucket.length > 100 ||
    config.evidenceBucket.includes('/') ||
    config.evidenceBucket.includes('%') ||
    config.serviceRoleKey.length === 0 ||
    config.serviceRoleKey.length > 8192 ||
    unsafeCredential.test(config.serviceRoleKey)
  )
    return unavailable()
  const base = origin.origin

  return async (context) => {
    let input: AuthorizedPrivateInspectionObject
    try {
      input = {
        organizationId: context.organizationId,
        projectId: context.projectId,
        evidenceId: context.evidenceId,
        bucket: context.bucket,
        objectKey: context.objectKey,
        expectedBytes: context.expectedBytes,
        expectedSha256: context.expectedSha256,
        signal: context.signal,
        deadlineMonotonicMs: context.deadlineMonotonicMs,
      }
    } catch {
      return unavailable()
    }
    const start = dependencies.now()
    if (
      ![input.organizationId, input.projectId, input.evidenceId].every(
        (id) => typeof id === 'string' && id.length === 36 && UUID.test(id),
      ) ||
      input.bucket !== config.evidenceBucket ||
      !Number.isSafeInteger(input.expectedBytes) ||
      input.expectedBytes <= 0 ||
      input.expectedBytes > MAX_BYTES ||
      typeof input.expectedSha256 !== 'string' ||
      input.expectedSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/i.test(input.expectedSha256) ||
      !Number.isFinite(start) ||
      !Number.isFinite(input.deadlineMonotonicMs) ||
      !(input.signal instanceof AbortSignal) ||
      input.deadlineMonotonicMs <= start ||
      input.signal.aborted ||
      typeof input.objectKey !== 'string' ||
      input.objectKey.length > 1024
    )
      return unavailable()
    const parts = input.objectKey.split('/')
    const prefix = [
      'organizations',
      input.organizationId,
      'projects',
      input.projectId,
      'evidence',
      input.evidenceId,
    ]
    if (
      parts.length !== 7 ||
      !parts.every(safeSegment) ||
      !prefix.every((part, index) => parts[index] === part)
    )
      return unavailable()

    const deadline = Math.min(start + STORAGE_DEADLINE_MS, input.deadlineMonotonicMs)
    const controller = new AbortController()
    const abort = () => controller.abort()
    const check = () => {
      if (controller.signal.aborted || input.signal.aborted || dependencies.now() >= deadline) {
        abort()
        return unavailable()
      }
    }
    input.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, Math.max(0, deadline - dependencies.now()))
    // No per-stage reset; connects, both metadata reads and all chunks share this timer.
    const abortable = async <T>(pending: Promise<T>): Promise<T> => {
      // Handle a late rejection even when check() detects a synchronously aborted transport.
      void pending.catch(() => undefined)
      check()
      let rejectAbort: () => void = () => undefined
      const cancellation = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new PrivateInspectionReadError())
        controller.signal.addEventListener('abort', rejectAbort, { once: true })
      })
      try {
        const result = await Promise.race([pending, cancellation])
        check()
        return result
      } finally {
        controller.signal.removeEventListener('abort', rejectAbort)
      }
    }

    const request = async (url: string): Promise<Response> => {
      check()
      let received: Response | undefined
      const pending = dependencies
        .fetch(url, {
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${config.serviceRoleKey}`,
            apikey: config.serviceRoleKey,
            Accept: 'application/octet-stream',
          },
        })
        .then((response) => {
          received = response
          // Even an injected/misbehaving transport resolving after cancellation cannot leak a stream.
          if (controller.signal.aborted) {
            cancelBody(response.body)
            return unavailable()
          }
          if (
            response.status !== 200 ||
            response.redirected ||
            (response.url && response.url !== url)
          ) {
            cancelBody(response.body)
            return unavailable()
          }
          return response
        })
      try {
        return await abortable(pending)
      } catch (error) {
        if (received) cancelBody(received.body)
        throw error
      }
    }

    const countedBody = async (
      response: Response,
      capacity: number,
      exact: boolean,
    ): Promise<Buffer> => {
      if (!response.body) return unavailable()
      const advertised = response.headers.get('content-length')
      if (
        advertised !== null &&
        (!/^\d+$/.test(advertised) ||
          !Number.isSafeInteger(Number(advertised)) ||
          Number(advertised) > capacity)
      ) {
        cancelBody(response.body)
        return unavailable()
      }
      const reader = response.body.getReader()
      const cancel = () => {
        void reader.cancel().catch(() => undefined)
      }
      controller.signal.addEventListener('abort', cancel, { once: true })
      const buffer = Buffer.alloc(capacity)
      const digest = exact ? createHash('sha256') : undefined
      let count = 0
      try {
        while (true) {
          check()
          const item = await abortable(reader.read())
          if (item.done) break
          if (!(item.value instanceof Uint8Array) || item.value.byteLength > capacity - count)
            return unavailable()
          // Fixed allocation: millions of tiny chunks cannot create an unbounded chunk-list.
          buffer.set(item.value, count)
          digest?.update(item.value)
          count += item.value.byteLength
        }
        check()
        if (
          exact &&
          (count !== capacity || digest?.digest('hex') !== input.expectedSha256.toLowerCase())
        )
          return unavailable()
        return exact ? buffer : buffer.subarray(0, count)
      } finally {
        cancel()
        controller.signal.removeEventListener('abort', cancel)
        try {
          reader.releaseLock()
        } catch {
          /* Cancellation already requested. */
        }
      }
    }

    const bucketUrl = `${base}/storage/v1/bucket/${encodeURIComponent(input.bucket)}`
    const checkPrivateBucket = async () => {
      const metadata = await countedBody(await request(bucketUrl), MAX_METADATA_BYTES, false)
      let bucket: unknown
      try {
        bucket = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata))
      } catch {
        return unavailable()
      }
      if (
        !bucket ||
        typeof bucket !== 'object' ||
        Array.isArray(bucket) ||
        !('id' in bucket) ||
        bucket.id !== input.bucket ||
        !('public' in bucket) ||
        bucket.public !== false
      )
        return unavailable()
    }

    try {
      check()
      await checkPrivateBucket()
      const objectUrl = `${base}/storage/v1/object/${encodeURIComponent(input.bucket)}/${parts.map(encodeURIComponent).join('/')}`
      const verified = await countedBody(await request(objectUrl), input.expectedBytes, true)
      await checkPrivateBucket()
      check()
      return verified
    } catch {
      // Never retain provider cause, URL, headers, object key, digest or credentials.
      throw new PrivateInspectionReadError()
    } finally {
      clearTimeout(timer)
      input.signal.removeEventListener('abort', abort)
      abort()
    }
  }
}

// Production companion: use config supplied by existing readApiEnv wrapper, never caller input.
export const createPrivateInspectionReader = (config: PrivateInspectionStorageConfig): Reader =>
  buildReader(config, { fetch: globalThis.fetch, now: () => performance.now() })
