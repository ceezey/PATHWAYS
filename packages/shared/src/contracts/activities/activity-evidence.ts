import { z } from 'zod'

import { lengthString } from '../common/field-schemas'

// Content types accepted for activity evidence (cr-pathways-activity-progress-media).
export const activityEvidenceContentTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const
export type ActivityEvidenceContentType = (typeof activityEvidenceContentTypes)[number]
export const MAX_ACTIVITY_EVIDENCE_FILES = 10

// Declares one evidence file before upload, with the configured per-file byte limit enforced by the service.
export const activityEvidenceFile = z
  .object({
    fileName: lengthString(1, 128).refine(
      (value) => /^[^\\/]+$/.test(value),
      'must not contain a slash',
    ),
    contentType: z.enum(activityEvidenceContentTypes),
    byteSize: z.number().int().min(1).max(104_857_600),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lower-case SHA-256 digest'),
  })
  .strict()
export type ActivityEvidenceFile = z.infer<typeof activityEvidenceFile>
