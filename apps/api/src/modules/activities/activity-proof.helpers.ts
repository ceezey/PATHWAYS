import { BadRequestException } from '@nestjs/common'
import {
  type ActivityEvidenceContentType,
  type ActivityEvidenceFile,
  MAX_ACTIVITY_EVIDENCE_FILES,
  activityEvidenceContentTypes,
} from '@pathways/shared'

import { sourceMutationBody } from '../rules/rules-source-operation'
import type { UploadVerification } from '../storage/private-inspection-reader'

// Storage deadline per finalize or inspection read (cr-pathways-activity-progress-media 3.5).
export const PROOF_STORAGE_DEADLINE_MS = 60_000

export const evidenceExtension: Record<ActivityEvidenceContentType, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}

/** Activity-update evidence is typed from its verified content type (0041). */
export function activityEvidenceType(contentType: ActivityEvidenceContentType) {
  return contentType.startsWith('image/')
    ? ('PHOTO' as const)
    : contentType.startsWith('video/')
      ? ('VIDEO' as const)
      : ('DOCUMENT' as const)
}

export function activityEvidenceLimits(maxFileBytes: number) {
  return {
    maxFiles: MAX_ACTIVITY_EVIDENCE_FILES,
    maxFileBytes,
    maxTotalBytes: maxFileBytes * 5,
    contentTypes: [...activityEvidenceContentTypes],
  }
}

const proofRejection = (code: string, message: string) =>
  new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message })

/** Bounded, normalized proof declarations. Checked before any database or storage work. */
export function proofDeclarations(files: ActivityEvidenceFile[], maxFileBytes: number) {
  const limits = activityEvidenceLimits(maxFileBytes)
  if (!Array.isArray(files) || files.length < 1 || files.length > limits.maxFiles)
    throw proofRejection('PROOF_FILE_COUNT', 'Attach between one and ten evidence files.')
  const declared = files.map((file) => {
    const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : ''
    if (
      !fileName ||
      fileName.length > 128 ||
      /[\/]/.test(fileName) ||
      !activityEvidenceContentTypes.includes(file.contentType) ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize < 1
    )
      throw proofRejection('PROOF_FILE_INVALID', 'An evidence file has an invalid name or type.')
    if (file.byteSize > limits.maxFileBytes)
      throw proofRejection('PROOF_FILE_TOO_LARGE', 'An evidence file exceeds the per-file limit.')
    return {
      fileName,
      contentType: file.contentType,
      byteSize: file.byteSize,
      sha256: file.sha256,
    }
  })
  if (new Set(declared.map((file) => file.sha256)).size !== declared.length)
    throw proofRejection('PROOF_FILE_DUPLICATE', 'The same evidence file was attached twice.')
  if (declared.reduce((total, file) => total + file.byteSize, 0) > limits.maxTotalBytes)
    throw proofRejection('PROOF_TOTAL_TOO_LARGE', 'The evidence files exceed the total limit.')
  return declared
}

export const declarationKey = (file: {
  fileName: string
  sha256: string
  contentType: string | null
  byteSize: number | bigint | null
}) => JSON.stringify([file.fileName, file.sha256, file.contentType, String(file.byteSize)])

export const verificationFailure: Record<Exclude<UploadVerification, 'VERIFIED'>, string> = {
  OBJECT_MISSING: 'The evidence file was not uploaded. Upload it, then finalize again.',
  SIZE_MISMATCH: 'The uploaded evidence file size does not match its declaration.',
  TYPE_MISMATCH: 'The uploaded evidence file content does not match its declared type.',
  DIGEST_MISMATCH: 'The uploaded evidence file content does not match its declared digest.',
}

export function proofFinalizeBody(
  updateId: string,
  progressPercent: number,
  note: string,
  files: Array<{
    fileName: string
    sha256: string
    contentType: string | null
    byteSize: number | bigint | null
  }>,
) {
  return sourceMutationBody({
    updateId,
    progressPercent,
    note,
    files: files.map((file) => ({
      fileName: file.fileName,
      sha256: file.sha256,
      contentType: file.contentType,
      byteSize: Number(file.byteSize),
    })),
  })
}
