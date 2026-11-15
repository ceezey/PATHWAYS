import type { RecoveryPointProblem } from '@pathways/shared'
import {
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  type BackupStorage,
  pointCopyPath,
  pointPrefix,
} from './backup-storage'
import {
  type ManifestFile,
  type RecoveryPointManifest,
  recoveryPointManifest,
  sha256Hex,
} from './recovery-point-manifest'

export type RecoveryPointCheck =
  | { problem: RecoveryPointProblem; markUnavailable: boolean }
  | {
      problem: null
      manifest: RecoveryPointManifest
      data: Buffer
      filesToRestore: ManifestFile[]
    }

const sameFile = (a: ManifestFile, b: ManifestFile) =>
  a.size === b.size && a.checksum === b.checksum

/** The E3 checks, first failure wins; storage being unavailable is not caught (E1). */
export async function checkRecoveryPoint(input: {
  organizationId: string
  point: { id: string; status: string; manifestSha256: string | null }
  currentMigration: string
  storage: Pick<BackupStorage, 'read' | 'listOrganizationFiles' | 'listPointFiles'>
}): Promise<RecoveryPointCheck> {
  const { organizationId, point, currentMigration, storage } = input
  const refuse = (problem: RecoveryPointProblem) => ({
    problem,
    markUnavailable: problem !== 'NOT_READY' && problem !== 'MIGRATION_MISMATCH',
  })
  if (point.status !== 'READY') return refuse('NOT_READY')
  const prefix = pointPrefix(organizationId, point.id)
  const manifestBytes = await storage.read(`${prefix}/${BACKUP_MANIFEST_FILE}`)
  if (!manifestBytes) return refuse('DATA_FILE_MISSING')
  if (sha256Hex(manifestBytes) !== point.manifestSha256) return refuse('CHECKSUM_MISMATCH')
  let manifest: RecoveryPointManifest
  try {
    manifest = recoveryPointManifest.parse(JSON.parse(manifestBytes.toString('utf8')))
  } catch {
    return refuse('CHECKSUM_MISMATCH')
  }
  if (manifest.organizationId !== organizationId || manifest.pointId !== point.id)
    return refuse('OTHER_ORGANIZATION')
  if (manifest.migration !== currentMigration) return refuse('MIGRATION_MISMATCH')
  const data = await storage.read(`${prefix}/${BACKUP_DATA_FILE}`)
  if (!data) return refuse('DATA_FILE_MISSING')
  if (data.length !== manifest.dataFile.size || sha256Hex(data) !== manifest.dataFile.sha256)
    return refuse('CHECKSUM_MISMATCH')
  const live = new Map(
    (await storage.listOrganizationFiles(organizationId)).map((file) => [file.name, file]),
  )
  const filesToRestore: ManifestFile[] = []
  if (manifest.fileMode === 'manifest') {
    for (const file of manifest.files) {
      const found = live.get(file.name)
      if (!found) return refuse('FILE_MISSING')
      if (!sameFile(found, file)) return refuse('FILE_CHANGED')
    }
  } else {
    const copies = new Map(
      (await storage.listPointFiles(organizationId, point.id)).map((file) => [file.name, file]),
    )
    for (const file of manifest.files) {
      const copy = copies.get(pointCopyPath(organizationId, point.id, file.name))
      if (!copy || !sameFile(copy, file)) return refuse('FILE_MISSING')
      const found = live.get(file.name)
      if (!found || !sameFile(found, file)) filesToRestore.push(file)
    }
  }
  return { problem: null, manifest, data, filesToRestore }
}
