import type { ActivityProofUploadLimits } from '@/types/pathways'

// Advisory-only defaults shown before the server's own limits load
// (cr-pathways-activity-progress-media 3.2). The server is authoritative either way.
export const fallbackLimits: ActivityProofUploadLimits = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  contentTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
}

export type FileStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed'

// A 409 on reservation means the activity cannot take this proof right now. The most common
// case is an earlier progress note or proof that M&E has not reviewed yet: say so plainly and
// say what unblocks it, instead of repeating the bare server sentence.
export function conflictMessage(serverMessage: string) {
  if (/already awaiting review/i.test(serverMessage))
    return 'Another update on this activity is still waiting for M&E review, so this proof cannot be submitted yet. Ask the M&E reviewer to approve or return that update, then submit again.'
  return `${serverMessage} Reload the activity to see its current state, then try again.`
}

export interface ProofFileItem {
  key: string
  file: File
  status: FileStatus
  error?: string
  evidenceId?: string
  uploadUrl?: string | null
  sha256?: string
}

export const megabytes = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`

export const statusLabel = (status: FileStatus) =>
  status === 'waiting'
    ? 'Waiting'
    : status === 'uploading'
      ? 'Uploading'
      : status === 'uploaded'
        ? 'Uploaded'
        : 'Failed'
