import { Inject, Injectable } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { StorageService, isMissingObjectError } from '../storage/storage.service'
import type { ManifestFile } from './recovery-point-manifest'

export const BACKUP_DATA_FILE = 'data.json.gz'
export const BACKUP_MANIFEST_FILE = 'manifest.json'
export const BACKUP_FILES_DIR = 'files'

export const organizationPrefix = (orgId: string) => `organizations/${orgId}`
export const pointPrefix = (orgId: string, pointId: string) =>
  `${organizationPrefix(orgId)}/backups/${pointId}`
export const pointCopyPath = (orgId: string, pointId: string, fileName: string) =>
  `${pointPrefix(orgId, pointId)}/${BACKUP_FILES_DIR}/${fileName.slice(organizationPrefix(orgId).length + 1)}`

/** Storage is not configured or did not answer (E1). */
export class BackupStorageUnavailableError extends Error {
  constructor() {
    super('Backup storage is unavailable.')
    this.name = 'BackupStorageUnavailableError'
  }
}

const isTooLarge = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  (String(Object.getOwnPropertyDescriptor(error, 'statusCode')?.value) === '413' ||
    Object.getOwnPropertyDescriptor(error, 'status')?.value === 413)

/** Recovery point files in the private evidence bucket, under organizations/<orgId>/backups/<pointId>/. */
@Injectable()
export class BackupStorage {
  private readonly bucket = readApiEnv(process.env).EVIDENCE_BUCKET

  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  private async call<T>(work: () => Promise<T>, missing?: () => T): Promise<T> {
    if (!this.storage.isConfigured()) throw new BackupStorageUnavailableError()
    try {
      return await work()
    } catch (error) {
      if (missing && isMissingObjectError(error)) return missing()
      // A file over the Storage size limit is a failed backup, not unavailable storage.
      if (isTooLarge(error))
        throw new Error('The recovery point file is over the storage size limit.')
      throw new BackupStorageUnavailableError()
    }
  }

  // shortcut: one list call (plus a bucket check) per folder, in sequence; parallelize or check the bucket once per walk if devV2 capture times near the 300 s limit.
  private async walk(prefix: string, skip?: string): Promise<ManifestFile[]> {
    const entries = await this.call(() => this.storage.listObjects(this.bucket, prefix))
    const files: ManifestFile[] = []
    for (const entry of entries) {
      if (entry.name === skip) continue
      if (entry.folder) files.push(...(await this.walk(entry.name)))
      else
        files.push({
          name: entry.name,
          size: entry.size,
          checksum: entry.checksum,
          contentType: entry.contentType,
        })
    }
    return files
  }

  listOrganizationFiles(orgId: string) {
    return this.walk(organizationPrefix(orgId), `${organizationPrefix(orgId)}/backups`)
  }

  listPointFiles(orgId: string, pointId: string) {
    return this.walk(pointPrefix(orgId, pointId))
  }

  read(path: string): Promise<Buffer | null> {
    return this.call<Buffer | null>(
      () => this.storage.downloadPrivateFile(this.bucket, path),
      () => null,
    )
  }

  async write(path: string, body: Buffer, contentType: 'application/gzip' | 'application/json') {
    await this.call(() => this.storage.uploadPrivateFile(this.bucket, path, body, contentType))
  }

  async overwrite(
    path: string,
    body: Buffer,
    contentType: 'application/gzip' | 'application/json',
  ) {
    await this.call(() => this.storage.uploadFile(this.bucket, path, body, contentType))
  }

  copy(from: string, to: string) {
    return this.call(() => this.storage.copyObject(this.bucket, from, to))
  }

  async removePoint(orgId: string, pointId: string, paths: readonly string[]) {
    const prefix = `${pointPrefix(orgId, pointId)}/`
    if (paths.some((path) => !path.startsWith(prefix)))
      throw new Error('Refusing to remove a file outside the recovery point.')
    await this.call(() => this.storage.removeFiles(this.bucket, paths))
  }

  signedUrl(path: string, seconds: number, downloadName: string): Promise<string | null> {
    return this.call<string | null>(
      async () =>
        (await this.storage.generateSignedUrl(this.bucket, path, seconds, downloadName)).signedUrl,
      () => null,
    )
  }
}
