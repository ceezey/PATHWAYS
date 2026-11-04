import { performance } from 'node:perf_hooks'
import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import type { readApiEnv } from '@pathways/config'

import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import { PROOF_STORAGE_DEADLINE_MS } from './activity-proof.helpers'

type ApiEnv = ReturnType<typeof readApiEnv>
interface StoredMedia {
  id: string
  bucket: string
  objectKey: string
  byteSize: bigint
  sha256: string
  contentType: string
}
interface MediaScope {
  organizationId: string
  projectId: string
  row: StoredMedia
}

const rejection = (code: string, message: string) =>
  new UnprocessableEntityException({
    statusCode: 422,
    error: 'Unprocessable Entity',
    code,
    message,
  })

const storageOptions = (env: ApiEnv) => ({
  serviceOrigin: env.SUPABASE_URL ?? '',
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  evidenceBucket: env.EVIDENCE_BUCKET,
  maxBytes: env.EVIDENCE_MAX_FILE_BYTES,
  storageDeadlineMs: PROOF_STORAGE_DEADLINE_MS,
})

/** Checks an uploaded media object against its declaration; any other outcome throws and a mismatch deletes the object. */
export async function verifyUploadedMedia(
  env: ApiEnv,
  storage: StorageService,
  factories: PrivateStorageFactories,
  { organizationId, projectId, row }: MediaScope,
) {
  const byteSize = Number(row.byteSize)
  if (!Number.isSafeInteger(byteSize) || byteSize > env.EVIDENCE_MAX_FILE_BYTES)
    throw rejection('PROOF_FILE_TOO_LARGE', 'The media file exceeds the current per-file limit.')
  let outcome: Awaited<
    ReturnType<ReturnType<PrivateStorageFactories['createPrivateUploadVerifier']>>
  >
  try {
    outcome = await factories.createPrivateUploadVerifier(storageOptions(env))({
      organizationId,
      projectId,
      evidenceId: row.id,
      bucket: row.bucket,
      objectKey: row.objectKey,
      expectedBytes: byteSize,
      expectedSha256: row.sha256,
      contentType: row.contentType,
      signal: new AbortController().signal,
      deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
    })
  } catch {
    throw new ServiceUnavailableException(
      'Media verification is temporarily unavailable. Retry finalizing this file.',
    )
  }
  if (outcome === 'VERIFIED') return
  if (outcome !== 'OBJECT_MISSING')
    await storage.deleteFile(row.bucket, row.objectKey).catch(() => undefined)
  throw rejection(
    `PROOF_${outcome}`,
    outcome === 'OBJECT_MISSING'
      ? 'The media file was not uploaded. Upload it, then finalize again.'
      : 'The uploaded media file does not match its declaration.',
  )
}

/** Opens a verified media stream; the stream withholds its last bytes unless size and digest still match. */
export async function streamVerifiedMedia(
  env: ApiEnv,
  factories: PrivateStorageFactories,
  { organizationId, projectId, row }: MediaScope,
) {
  try {
    const byteSize = Number(row.byteSize)
    const body = await factories.createPrivateObjectStreamer(storageOptions(env)).release({
      organizationId,
      projectId,
      evidenceId: row.id,
      bucket: row.bucket,
      objectKey: row.objectKey,
      expectedBytes: byteSize,
      expectedSha256: row.sha256,
      signal: new AbortController().signal,
      deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
    })
    return { body, byteSize, contentType: row.contentType }
  } catch {
    throw new ServiceUnavailableException('Media is temporarily unavailable.')
  }
}
