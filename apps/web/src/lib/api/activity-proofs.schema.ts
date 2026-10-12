import { isFiniteNonNegative } from '@/lib/api/core/guards'
import { PathwaysClientError } from '@/lib/api/core/request'
import { webEnv } from '@/lib/env'
import type {
  ActivityProofFinalizeResult,
  ActivityProofReservation,
  ActivityProofReservedFile,
  ActivityProofUploadLimits,
} from '@/types/pathways'

import { parseActivity } from './activities.schema'

const MAX_ACTIVITY_PROOF_FILES = 10

// The signed upload URL must point at the configured Supabase storage origin. Anything else
// (a mismatched host, a non-https scheme, an unexpected origin) is treated as a network error
// rather than followed.
const isAllowedActivityProofUploadUrl = (value: unknown): value is string | null => {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const configuredSupabaseUrl = (webEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  if (!configuredSupabaseUrl) return false
  let parsed: URL
  let allowed: URL
  try {
    parsed = new URL(value)
    allowed = new URL(configuredSupabaseUrl)
  } catch {
    return false
  }
  if (parsed.origin !== allowed.origin) return false
  if (parsed.protocol === 'https:') return true
  // The local Supabase stack (pnpm dev:local) serves storage over plain http on a loopback host;
  // that is accepted only when the configured Supabase URL is itself that loopback origin.
  return (
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  )
}

export function parseActivityProofUploadLimits(value: unknown): ActivityProofUploadLimits {
  const row = value as Partial<Record<keyof ActivityProofUploadLimits, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 4 ||
    !isFiniteNonNegative(row.maxFiles) ||
    !isFiniteNonNegative(row.maxFileBytes) ||
    !isFiniteNonNegative(row.maxTotalBytes) ||
    !Array.isArray(row.contentTypes) ||
    row.contentTypes.length > MAX_ACTIVITY_PROOF_FILES ||
    row.contentTypes.some((entry) => typeof entry !== 'string')
  )
    throw new PathwaysClientError('Invalid activity proof upload limits response.', 'network')
  return {
    maxFiles: row.maxFiles,
    maxFileBytes: row.maxFileBytes,
    maxTotalBytes: row.maxTotalBytes,
    contentTypes: row.contentTypes as string[],
  }
}

function parseActivityProofReservedFile(value: unknown): ActivityProofReservedFile {
  const row = value as Partial<Record<keyof ActivityProofReservedFile, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 7 ||
    typeof row.evidenceId !== 'string' ||
    typeof row.fileName !== 'string' ||
    typeof row.contentType !== 'string' ||
    !isFiniteNonNegative(row.byteSize) ||
    typeof row.sha256 !== 'string' ||
    typeof row.storageReady !== 'boolean' ||
    !isAllowedActivityProofUploadUrl(row.uploadUrl)
  )
    throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
  return {
    evidenceId: row.evidenceId,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    storageReady: row.storageReady,
    uploadUrl: row.uploadUrl,
  }
}

export function parseActivityProofReservation(value: unknown): ActivityProofReservation {
  const row = value as Partial<Record<string, unknown>> | null
  if (!row || typeof row !== 'object' || typeof row.clientUpdateId !== 'string')
    throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
  if (row.status === 'COMMITTED') {
    if (Object.keys(row).length !== 3 || !('acknowledgement' in row))
      throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
    return {
      clientUpdateId: row.clientUpdateId,
      status: 'COMMITTED',
      acknowledgement: row.acknowledgement,
    }
  }
  if (row.status === 'UPLOADING' || row.status === 'READY_TO_COMMIT') {
    if (
      Object.keys(row).length !== 4 ||
      typeof row.updateId !== 'string' ||
      !Array.isArray(row.files) ||
      row.files.length > MAX_ACTIVITY_PROOF_FILES
    )
      throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
    return {
      clientUpdateId: row.clientUpdateId,
      updateId: row.updateId,
      status: row.status,
      files: row.files.map(parseActivityProofReservedFile),
    }
  }
  throw new PathwaysClientError('Invalid activity proof reservation response.', 'network')
}

export function parseActivityProofFinalizeResult(value: unknown): ActivityProofFinalizeResult {
  const row = value as Partial<Record<string, unknown>> | null
  if (!row || typeof row !== 'object')
    throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
  if (row.status === 'COMMITTED') {
    if (Object.keys(row).length !== 2)
      throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
    if ('acknowledgement' in row) {
      return { status: 'COMMITTED', acknowledgement: row.acknowledgement }
    }
    if ('activity' in row) {
      const activityRow = row.activity as Partial<Record<string, unknown>> | null
      if (
        !activityRow ||
        typeof activityRow !== 'object' ||
        !('sourceAcknowledgement' in activityRow)
      )
        throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
      const { sourceAcknowledgement, ...activityFields } = activityRow
      const activity = parseActivity(activityFields)
      return { status: 'COMMITTED', activity: { ...activity, sourceAcknowledgement } }
    }
    throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
  }
  if (row.status === 'UPLOADING') {
    if (
      Object.keys(row).length !== 3 ||
      typeof row.updateId !== 'string' ||
      !isFiniteNonNegative(row.remaining)
    )
      throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
    return { status: 'UPLOADING', updateId: row.updateId, remaining: row.remaining }
  }
  throw new PathwaysClientError('Invalid activity proof finalize response.', 'network')
}
