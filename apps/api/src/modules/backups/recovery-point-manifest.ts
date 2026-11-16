import { createHash } from 'node:crypto'
import { recoveryPointFileModes, recoveryPointKinds } from '@pathways/shared'
import { z } from 'zod'

export const RECOVERY_POINT_MANIFEST_FORMAT = 'pathways.recovery-point-manifest.v1'

// File checksums are the Storage eTag; the data file and the manifest itself use SHA-256.
export const manifestFile = z
  .object({
    name: z.string().min(1).max(1024),
    size: z.number().int().nonnegative(),
    checksum: z.string().max(200),
    contentType: z.string().max(200),
  })
  .strict()
export type ManifestFile = z.infer<typeof manifestFile>

export const recoveryPointManifest = z
  .object({
    format: z.literal(RECOVERY_POINT_MANIFEST_FORMAT),
    pointId: z.guid(),
    organizationId: z.guid(),
    pointType: z.enum(recoveryPointKinds),
    fileMode: z.enum(recoveryPointFileModes),
    createdById: z.guid().nullable(),
    capturedAt: z.string().datetime({ offset: true }),
    migration: z.string().min(1).max(255),
    rowCounts: z.record(z.string(), z.number().int().nonnegative()),
    dataFile: z
      .object({
        name: z.literal('data.json.gz'),
        size: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    files: z.array(manifestFile),
  })
  .strict()
export type RecoveryPointManifest = z.infer<typeof recoveryPointManifest>

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')
