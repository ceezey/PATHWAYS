import { z } from 'zod'

import {
  MAX_ACTIVITY_EVIDENCE_FILES,
  activityEvidenceContentTypes,
} from '../activities/activity-evidence'
import { lengthString } from '../common/field-schemas'

// Beneficiary media allows the activity-proof types except documents.
export const beneficiaryMediaContentTypes: readonly string[] = activityEvidenceContentTypes.filter(
  (type) => type !== 'application/pdf',
)
export const MAX_BENEFICIARY_MEDIA_FILES = MAX_ACTIVITY_EVIDENCE_FILES

const beneficiaryMediaFile = z
  .object({
    fileName: lengthString(1, 128).refine(
      (value) => /^[^/]+$/.test(value),
      'must not contain a forward slash',
    ),
    contentType: z
      .enum(activityEvidenceContentTypes)
      .refine(
        (value) => beneficiaryMediaContentTypes.includes(value),
        'is not an allowed media type',
      ),
    // Structural ceiling only; the service enforces the configured EVIDENCE_MAX_FILE_BYTES.
    byteSize: z.number().int().min(1).max(104_857_600),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase SHA-256 hex digest'),
  })
  .strict()

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/media/reservations.
export const reserveBeneficiaryMediaRequest = z
  .object({
    files: z.array(beneficiaryMediaFile).min(1).max(MAX_BENEFICIARY_MEDIA_FILES),
    note: lengthString(0, 500).nullish(),
  })
  .strict()
export type ReserveBeneficiaryMediaRequest = z.infer<typeof reserveBeneficiaryMediaRequest>
