import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { Readable } from 'node:stream'

import { isApprovedServiceProtocol } from '@pathways/config'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
// Highest configurable evidence object (EVIDENCE_MAX_FILE_BYTES ceiling).
const MAX_CONFIGURABLE_BYTES = 100 * 1024 * 1024
const MAX_METADATA_BYTES = 16 * 1024
const DEFAULT_STORAGE_DEADLINE_MS = 10_000
const MAX_STORAGE_DEADLINE_MS = 60_000
// Leading bytes read for a content-type check; enough for every allow-listed signature.
const SNIFF_BYTES = 64
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PrivateInspectionReadError extends Error {
  constructor() {
    super('Private inspection storage is unavailable.')
    this.name = 'PrivateInspectionReadError'
  }
}

interface PrivateInspectionStorageConfig {
  serviceOrigin: string
  serviceRoleKey: string
  evidenceBucket: string
  /** Fixed server-owned purpose; never sourced from a request or artifact DTO. */
  objectKind?: 'evidence' | 'reports'
  /** Fixed server-owned object bound (default 10 MiB, at most 100 MiB). */
  maxBytes?: number
  /** Fixed server-owned storage deadline per read (default 10 s, at most 60 s). */
  storageDeadlineMs?: number
}

// Every field is internal authorized context, never an HTTP path/choice/DTO.
interface AuthorizedPrivateInspectionObject {
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
type Config = Required<PrivateInspectionStorageConfig>

const unavailable = (): never => {
  throw new PrivateInspectionReadError()
}
// biome-ignore lint/suspicious/noControlCharactersInRegex: Deny unsafe object-path controls.
const unsafePathSegment = /[\u0000-\u001f\u007f\\]/
// biome-ignore lint/suspicious/noControlCharactersInRegex: Deny credential controls and whitespace.
const unsafeCredential = /[\u0000- \u007f]/
const safeSegment = (value: string) =>
  value.length > 0 && value !== '.' && value !== '..' && !unsafePathSegment.test(value)
const cancelBody = (body: ReadableStream<Uint8Array> | null) => {
  if (body) void body.cancel().catch(() => undefined)
}

function validateConfig(configuration: PrivateInspectionStorageConfig) {
  let config: Config
  try {
    config = {
      serviceOrigin: configuration.serviceOrigin,
      serviceRoleKey: configuration.serviceRoleKey,
      evidenceBucket: configuration.evidenceBucket,
      objectKind: configuration.objectKind ?? 'evidence',
      maxBytes: configuration.maxBytes ?? DEFAULT_MAX_BYTES,
      storageDeadlineMs: configuration.storageDeadlineMs ?? DEFAULT_STORAGE_DEADLINE_MS,
    }
  } catch {
    return unavailable()
  }
  if (
    typeof config.serviceOrigin !== 'string' ||
    typeof config.serviceRoleKey !== 'string' ||
    typeof config.evidenceBucket !== 'string' ||
    (config.objectKind !== 'evidence' && config.objectKind !== 'reports') ||
    !Number.isSafeInteger(config.maxBytes) ||
    config.maxBytes < 1 ||
    config.maxBytes > MAX_CONFIGURABLE_BYTES ||
    !Number.isSafeInteger(config.storageDeadlineMs) ||
    config.storageDeadlineMs < 1 ||
    config.storageDeadlineMs > MAX_STORAGE_DEADLINE_MS
  )
    return unavailable()
  let origin: URL
  try {
    origin = new URL(config.serviceOrigin)
  } catch {
    return unavailable()
  }
  const rawRootOnly = /^https?:\/\/[^/?#]+\/?$/
  if (
    !isApprovedServiceProtocol(origin) ||
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
  return { config, base: origin.origin }
}

function snapshotInput(context: AuthorizedPrivateInspectionObject) {
  try {
    return {
      organizationId: context.organizationId,
      projectId: context.projectId,
      evidenceId: context.evidenceId,
      bucket: context.bucket,
      objectKey: context.objectKey,
      expectedBytes: context.expectedBytes,
      expectedSha256: context.expectedSha256,
      signal: context.signal,
      deadlineMonotonicMs: context.deadlineMonotonicMs,
    } satisfies AuthorizedPrivateInspectionObject
  } catch {
    return unavailable()
  }
}

type CountedMode = 'metadata' | 'buffer' | 'digest' | 'prefix'
type Counted = { bytes: Buffer; count: number; overflow: boolean; sha256: string | null }

/**
 * One bounded storage session for one authorized object: validated identity, a single
 * monotonic deadline covering every connection and chunk, and caller disconnect.
 */
function openSession(
  validated: { config: Config; base: string },
  dependencies: Dependencies,
  context: AuthorizedPrivateInspectionObject,
) {
  const { config, base } = validated
  const input = snapshotInput(context)
  const start = dependencies.now()
  if (
    ![input.organizationId, input.projectId, input.evidenceId].every(
      (id) => typeof id === 'string' && id.length === 36 && UUID.test(id),
    ) ||
    input.bucket !== config.evidenceBucket ||
    !Number.isSafeInteger(input.expectedBytes) ||
    input.expectedBytes <= 0 ||
    input.expectedBytes > config.maxBytes ||
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
    config.objectKind,
    input.evidenceId,
  ]
  if (
    parts.length !== 7 ||
    !parts.every(safeSegment) ||
    !prefix.every((part, index) => parts[index] === part)
  )
    return unavailable()

  const deadline = Math.min(start + config.storageDeadlineMs, input.deadlineMonotonicMs)
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

  const request = async (
    url: string,
    options: { method?: 'GET' | 'HEAD'; range?: string; accept?: readonly number[] } = {},
  ): Promise<Response> => {
    check()
    const accept = options.accept ?? [200]
    let received: Response | undefined
    const pending = dependencies
      .fetch(url, {
        method: options.method ?? 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          apikey: config.serviceRoleKey,
          Accept: 'application/octet-stream',
          ...(options.range ? { Range: options.range } : {}),
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
          !accept.includes(response.status) ||
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

  /**
   * Counted read of at most `capacity` bytes, independent of Content-Length.
   * - metadata: bounded JSON body; overflow denies.
   * - buffer: exact verified object in one fixed allocation; any mismatch denies.
   * - digest: exact count and SHA-256 with no retention; overflow is reported, not thrown.
   * - prefix: the first `capacity` bytes, then the remainder is cancelled unread.
   */
  const counted = async (
    response: Response,
    capacity: number,
    mode: CountedMode,
  ): Promise<Counted> => {
    if (!response.body) return unavailable()
    const advertised = response.headers.get('content-length')
    if (
      advertised !== null &&
      (!/^\d+$/.test(advertised) ||
        !Number.isSafeInteger(Number(advertised)) ||
        (mode !== 'prefix' && mode !== 'digest' && Number(advertised) > capacity))
    ) {
      cancelBody(response.body)
      return unavailable()
    }
    const reader = response.body.getReader()
    const cancel = () => {
      void reader.cancel().catch(() => undefined)
    }
    controller.signal.addEventListener('abort', cancel, { once: true })
    // Fixed allocation: millions of tiny chunks cannot create an unbounded chunk-list.
    const buffer = mode === 'digest' ? Buffer.alloc(0) : Buffer.alloc(capacity)
    const digest = mode === 'buffer' || mode === 'digest' ? createHash('sha256') : undefined
    let count = 0
    let overflow = false
    try {
      while (true) {
        check()
        if (mode === 'prefix' && count >= capacity) break
        const item = await abortable(reader.read())
        if (item.done) break
        if (!(item.value instanceof Uint8Array)) return unavailable()
        if (item.value.byteLength > capacity - count) {
          if (mode === 'prefix') {
            buffer.set(item.value.subarray(0, capacity - count), count)
            count = capacity
            break
          }
          if (mode === 'digest') {
            overflow = true
            break
          }
          return unavailable()
        }
        if (mode !== 'digest') buffer.set(item.value, count)
        digest?.update(item.value)
        count += item.value.byteLength
      }
      check()
      const sha256 = digest && !overflow ? digest.digest('hex') : null
      if (
        mode === 'buffer' &&
        (count !== capacity || sha256 !== input.expectedSha256.toLowerCase())
      )
        return unavailable()
      return {
        bytes: mode === 'buffer' ? buffer : buffer.subarray(0, count),
        count,
        overflow,
        sha256,
      }
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
  const objectUrl = `${base}/storage/v1/object/${encodeURIComponent(input.bucket)}/${parts.map(encodeURIComponent).join('/')}`
  const checkPrivateBucket = async () => {
    const metadata = await counted(await request(bucketUrl), MAX_METADATA_BYTES, 'metadata')
    let bucket: unknown
    try {
      bucket = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata.bytes))
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
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    input.signal.removeEventListener('abort', abort)
    abort()
  }
  return { input, check, abortable, request, counted, checkPrivateBucket, objectUrl, close }
}

function buildReader(
  configuration: PrivateInspectionStorageConfig,
  suppliedDependencies: Dependencies,
): Reader {
  const dependencies = { fetch: suppliedDependencies.fetch, now: suppliedDependencies.now }
  const validated = validateConfig(configuration)
  return async (context) => {
    const session = openSession(validated, dependencies, context)
    try {
      session.check()
      await session.checkPrivateBucket()
      const verified = await session.counted(
        await session.request(session.objectUrl),
        session.input.expectedBytes,
        'buffer',
      )
      await session.checkPrivateBucket()
      session.check()
      return verified.bytes
    } catch {
      // Never retain provider cause, URL, headers, object key, digest or credentials.
      throw new PrivateInspectionReadError()
    } finally {
      session.close()
    }
  }
}

// Production companion: use config supplied by existing readApiEnv wrapper, never caller input.
export const createPrivateInspectionReader = (config: PrivateInspectionStorageConfig): Reader =>
  buildReader(config, { fetch: globalThis.fetch, now: () => performance.now() })

// ISO base media (MP4 and QuickTime) major brands accepted at offset 8 of a leading ftyp box.
const isoBrands = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'mp71',
  'avc1',
  'dash',
  'M4V ',
  'MSNV',
  'mmp4',
  '3gp4',
  '3gp5',
  '3gp6',
  '3g2a',
  'qt  ',
])
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  Buffer.from(bytes.subarray(start, start + length)).toString('latin1')
const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((value, index) => bytes[offset + index] === value)

/** EBML header with DocType "webm" (element 0x4282) inside the leading bytes. */
function webmSignature(bytes: Uint8Array) {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false
  for (let index = 4; index + 2 < bytes.length; index++) {
    if (bytes[index] !== 0x42 || bytes[index + 1] !== 0x82) continue
    const first = bytes[index + 2]
    let width = 1
    while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++
    if (width > 8 || index + 2 + width > bytes.length) return false
    let size = first & (0xff >> width)
    for (let extra = 1; extra < width; extra++) size = size * 256 + bytes[index + 2 + extra]
    const valueStart = index + 2 + width
    return size === 4 && ascii(bytes, valueStart, 4) === 'webm'
  }
  return false
}

/** Leading-byte signature check for the approved evidence content types. */
export function matchesEvidenceSignature(contentType: string, bytes: Uint8Array) {
  switch (contentType) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
    case 'application/pdf':
      return ascii(bytes, 0, 5) === '%PDF-'
    case 'video/mp4':
    case 'video/quicktime': {
      if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false
      const boxSize = Buffer.from(bytes.subarray(0, 4)).readUInt32BE(0)
      return boxSize >= 16 && boxSize <= 4096 && isoBrands.has(ascii(bytes, 8, 4))
    }
    case 'video/webm':
      return webmSignature(bytes)
    default:
      return false
  }
}

export type UploadVerification =
  | 'VERIFIED'
  | 'OBJECT_MISSING'
  | 'SIZE_MISMATCH'
  | 'TYPE_MISMATCH'
  | 'DIGEST_MISMATCH'

/**
 * Finalize-time verification of one directly uploaded private object: stored size, then a
 * range read of the leading bytes against the declared type, then a counted streamed SHA-256.
 * Nothing is retained. Mismatches are results; operational failures throw the sanitized error.
 */
function buildUploadVerifier(
  configuration: PrivateInspectionStorageConfig,
  suppliedDependencies: Dependencies,
) {
  const dependencies = { fetch: suppliedDependencies.fetch, now: suppliedDependencies.now }
  const validated = validateConfig(configuration)
  return async (
    context: AuthorizedPrivateInspectionObject & { contentType: string },
  ): Promise<UploadVerification> => {
    let contentType: string
    try {
      contentType = context.contentType
    } catch {
      return unavailable()
    }
    const session = openSession(validated, dependencies, context)
    try {
      if (typeof contentType !== 'string') return unavailable()
      session.check()
      await session.checkPrivateBucket()
      // Supabase Storage answers a missing object with 400 (or 404) and no body on HEAD.
      const head = await session.request(session.objectUrl, {
        method: 'HEAD',
        accept: [200, 400, 404],
      })
      cancelBody(head.body)
      if (head.status !== 200) return 'OBJECT_MISSING'
      const stored = head.headers.get('content-length')
      if (stored === null || !/^\d+$/.test(stored) || !Number.isSafeInteger(Number(stored)))
        return unavailable()
      if (Number(stored) !== session.input.expectedBytes) return 'SIZE_MISMATCH'
      const sniffLength = Math.min(SNIFF_BYTES, session.input.expectedBytes)
      const leading = await session.counted(
        await session.request(session.objectUrl, {
          range: `bytes=0-${sniffLength - 1}`,
          accept: [200, 206],
        }),
        sniffLength,
        'prefix',
      )
      if (!matchesEvidenceSignature(contentType, leading.bytes)) return 'TYPE_MISMATCH'
      const whole = await session.counted(
        await session.request(session.objectUrl),
        session.input.expectedBytes,
        'digest',
      )
      if (whole.overflow || whole.count !== session.input.expectedBytes) return 'SIZE_MISMATCH'
      if (whole.sha256 !== session.input.expectedSha256.toLowerCase()) return 'DIGEST_MISMATCH'
      await session.checkPrivateBucket()
      session.check()
      return 'VERIFIED'
    } catch {
      throw new PrivateInspectionReadError()
    } finally {
      session.close()
    }
  }
}

export const createPrivateUploadVerifier = (config: PrivateInspectionStorageConfig) =>
  buildUploadVerifier(config, { fetch: globalThis.fetch, now: () => performance.now() })

/**
 * Two-step streamed inspection for large private objects, without buffering the object:
 * - `verify` counts and hashes the whole object and retains nothing;
 * - `release` (called only after final authorization and audit) re-reads the object as a
 *   counted stream. It holds back the final chunk until the exact size, digest and a
 *   post-body private-bucket check pass, and otherwise errors, so an unverified object is
 *   never delivered complete.
 */
function buildStreamer(
  configuration: PrivateInspectionStorageConfig,
  suppliedDependencies: Dependencies,
) {
  const dependencies = { fetch: suppliedDependencies.fetch, now: suppliedDependencies.now }
  const validated = validateConfig(configuration)
  const verify = async (context: AuthorizedPrivateInspectionObject): Promise<void> => {
    const session = openSession(validated, dependencies, context)
    try {
      session.check()
      await session.checkPrivateBucket()
      const whole = await session.counted(
        await session.request(session.objectUrl),
        session.input.expectedBytes,
        'digest',
      )
      if (
        whole.overflow ||
        whole.count !== session.input.expectedBytes ||
        whole.sha256 !== session.input.expectedSha256.toLowerCase()
      )
        return unavailable()
      await session.checkPrivateBucket()
      session.check()
    } catch {
      throw new PrivateInspectionReadError()
    } finally {
      session.close()
    }
  }
  const release = async (context: AuthorizedPrivateInspectionObject): Promise<Readable> => {
    const session = openSession(validated, dependencies, context)
    let response: Response
    try {
      session.check()
      await session.checkPrivateBucket()
      response = await session.request(session.objectUrl)
      const advertised = response.headers.get('content-length')
      if (
        !response.body ||
        (advertised !== null &&
          (!/^\d+$/.test(advertised) || Number(advertised) !== session.input.expectedBytes))
      ) {
        cancelBody(response.body)
        return unavailable()
      }
    } catch {
      session.close()
      throw new PrivateInspectionReadError()
    }
    const body = response.body as ReadableStream<Uint8Array>
    async function* chunks() {
      const reader = body.getReader()
      const digest = createHash('sha256')
      let count = 0
      let held: Uint8Array | null = null
      try {
        while (true) {
          session.check()
          const item = await session.abortable(reader.read())
          if (item.done) break
          if (
            !(item.value instanceof Uint8Array) ||
            item.value.byteLength > session.input.expectedBytes - count
          )
            return unavailable()
          digest.update(item.value)
          count += item.value.byteLength
          if (held) yield Buffer.from(held)
          held = item.value
        }
        session.check()
        if (
          count !== session.input.expectedBytes ||
          digest.digest('hex') !== session.input.expectedSha256.toLowerCase() ||
          !held
        )
          return unavailable()
        await session.checkPrivateBucket()
        session.check()
        yield Buffer.from(held)
      } catch {
        throw new PrivateInspectionReadError()
      } finally {
        void reader.cancel().catch(() => undefined)
        session.close()
      }
    }
    return Readable.from(chunks(), { objectMode: false, highWaterMark: 64 * 1024 })
  }
  return { verify, release }
}

export const createPrivateObjectStreamer = (config: PrivateInspectionStorageConfig) =>
  buildStreamer(config, { fetch: globalThis.fetch, now: () => performance.now() })
