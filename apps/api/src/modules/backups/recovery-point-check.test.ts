import { describe, expect, it } from 'vitest'
import { pointCopyPath, pointPrefix } from './backup-storage'
import { checkRecoveryPoint } from './recovery-point-check'
import {
  type ManifestFile,
  RECOVERY_POINT_MANIFEST_FORMAT,
  sha256Hex,
} from './recovery-point-manifest'

const ORG = 'b1200000-0000-4000-8000-000000000001'
const OTHER_ORG = 'b1200000-0000-4000-8000-000000000002'
const POINT = 'b1200000-0000-4000-8000-000000000003'
const LISTED_FILE = `organizations/${ORG}/projects/p/evidence/e/proof.png`
const DATA = Buffer.from('synthetic gzip bytes')

type Patch = Partial<{
  status: string
  manifest: null
  manifestSha256: string
  manifestOrg: string
  currentMigration: string
  data: Buffer | null
  liveFiles: ManifestFile[]
  liveChecksum: string
  fileMode: 'manifest' | 'copy'
  copies: ManifestFile[]
}>

function fixture(patch: Patch) {
  const listed: ManifestFile = {
    name: LISTED_FILE,
    size: 5,
    checksum: 'abc',
    contentType: 'image/png',
  }
  const fileMode = patch.fileMode ?? 'manifest'
  const manifest = Buffer.from(
    JSON.stringify({
      format: RECOVERY_POINT_MANIFEST_FORMAT,
      pointId: POINT,
      organizationId: patch.manifestOrg ?? ORG,
      pointType: 'MANUAL',
      fileMode,
      createdById: null,
      capturedAt: '2026-11-12T01:00:00.000Z',
      migration: '0091_backup_recovery',
      rowCounts: { 'pathways.projects': 1 },
      dataFile: { name: 'data.json.gz', size: DATA.length, sha256: sha256Hex(DATA) },
      files: [listed],
    }),
  )
  const prefix = pointPrefix(ORG, POINT)
  const objects: Record<string, Buffer | null> = {
    [`${prefix}/manifest.json`]: patch.manifest === null ? null : manifest,
    [`${prefix}/data.json.gz`]: patch.data === undefined ? DATA : patch.data,
  }
  const live = patch.liveFiles ?? [{ ...listed, checksum: patch.liveChecksum ?? listed.checksum }]
  const copies = patch.copies ?? [{ ...listed, name: pointCopyPath(ORG, POINT, listed.name) }]
  return {
    organizationId: ORG,
    point: {
      id: POINT,
      status: patch.status ?? 'READY',
      manifestSha256: patch.manifestSha256 ?? sha256Hex(manifest),
    },
    currentMigration: patch.currentMigration ?? '0091_backup_recovery',
    storage: {
      read: async (path: string) => objects[path] ?? null,
      listOrganizationFiles: async () => live,
      listPointFiles: async () => copies,
    },
  }
}

describe('recovery point check', () => {
  it.each([
    ['a creating point', { status: 'CREATING' }, 'NOT_READY', false],
    ['a missing manifest', { manifest: null }, 'DATA_FILE_MISSING', true],
    ['a manifest checksum mismatch', { manifestSha256: 'f'.repeat(64) }, 'CHECKSUM_MISMATCH', true],
    ['another organization', { manifestOrg: OTHER_ORG }, 'OTHER_ORGANIZATION', true],
    ['an older migration', { currentMigration: '0092_next' }, 'MIGRATION_MISMATCH', false],
    ['a missing data file', { data: null }, 'DATA_FILE_MISSING', true],
    ['a changed data file', { data: Buffer.from('tampered') }, 'CHECKSUM_MISMATCH', true],
    ['a missing listed file (manifest mode)', { liveFiles: [] }, 'FILE_MISSING', true],
    ['a changed listed file (manifest mode)', { liveChecksum: 'other' }, 'FILE_CHANGED', true],
    ['a missing copy (copy mode)', { fileMode: 'copy', copies: [] }, 'FILE_MISSING', true],
  ] as Array<[string, Patch, string, boolean]>)(
    '%s gives %s',
    async (_label, patch, problem, markUnavailable) => {
      expect(await checkRecoveryPoint(fixture(patch))).toEqual({ problem, markUnavailable })
    },
  )

  it('passes a sound point with its manifest and data', async () => {
    const result = await checkRecoveryPoint(fixture({}))
    expect(result.problem).toBeNull()
    expect(result.problem === null && result.data).toEqual(DATA)
    expect(result.problem === null && result.filesToRestore).toEqual([])
  })

  it('copy mode lists a missing live file for restore instead of refusing', async () => {
    const result = await checkRecoveryPoint(fixture({ fileMode: 'copy', liveFiles: [] }))
    expect(result.problem).toBeNull()
    expect(result.problem === null && result.filesToRestore.map((f) => f.name)).toEqual([
      LISTED_FILE,
    ])
  })
})
