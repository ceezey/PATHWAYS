import { describe, expect, it, vi } from 'vitest'
import type { StorageService, StoredObject } from '../storage/storage.service'
import { BackupStorage, BackupStorageUnavailableError, pointCopyPath } from './backup-storage'

const file = (name: string): StoredObject => ({
  name,
  folder: false,
  size: 5,
  checksum: 'abc',
  contentType: 'image/png',
})
const folder = (name: string): StoredObject => ({
  name,
  folder: true,
  size: 0,
  checksum: '',
  contentType: '',
})

function fakeStorage(overrides: Partial<Record<keyof StorageService, unknown>> = {}) {
  const tree: Record<string, StoredObject[]> = {
    'organizations/o': [folder('organizations/o/projects'), folder('organizations/o/backups')],
    'organizations/o/projects': [folder('organizations/o/projects/p')],
    'organizations/o/projects/p': [folder('organizations/o/projects/p/evidence')],
    'organizations/o/projects/p/evidence': [folder('organizations/o/projects/p/evidence/e')],
    'organizations/o/projects/p/evidence/e': [
      file('organizations/o/projects/p/evidence/e/proof.png'),
    ],
    'organizations/o/backups': [file('organizations/o/backups/x/data.json.gz')],
  }
  const storage = {
    isConfigured: vi.fn(() => true),
    listObjects: vi.fn(async (_bucket: string, prefix: string) => tree[prefix] ?? []),
    downloadPrivateFile: vi.fn(),
    uploadPrivateFile: vi.fn(),
    uploadFile: vi.fn(),
    copyObject: vi.fn(),
    removeFiles: vi.fn(),
    generateSignedUrl: vi.fn(),
    ...overrides,
  }
  return { storage, backups: new BackupStorage(storage as unknown as StorageService) }
}

describe('backup storage', () => {
  it('walks the organization files and skips its own backups folder', async () => {
    const { backups } = fakeStorage()
    expect((await backups.listOrganizationFiles('o')).map((entry) => entry.name)).toEqual([
      'organizations/o/projects/p/evidence/e/proof.png',
    ])
  })

  it('reads a missing object as null and fails other storage errors as unavailable', async () => {
    const missing = fakeStorage({
      downloadPrivateFile: vi.fn().mockRejectedValue({ statusCode: '404' }),
    })
    await expect(
      missing.backups.read('organizations/o/backups/p/manifest.json'),
    ).resolves.toBeNull()
    const broken = fakeStorage({
      downloadPrivateFile: vi.fn().mockRejectedValue({ statusCode: '500' }),
    })
    await expect(broken.backups.read('a')).rejects.toBeInstanceOf(BackupStorageUnavailableError)
    const off = fakeStorage({ isConfigured: vi.fn(() => false) })
    await expect(off.backups.read('a')).rejects.toBeInstanceOf(BackupStorageUnavailableError)
    expect(off.storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('keeps a file over the size limit a plain failure, not unavailable storage', async () => {
    const { backups } = fakeStorage({
      uploadPrivateFile: vi.fn().mockRejectedValue({ statusCode: '413' }),
    })
    const failure = await backups
      .write('organizations/o/backups/p/data.json.gz', Buffer.from('x'), 'application/gzip')
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(BackupStorageUnavailableError)
  })

  it('refuses to remove a file outside the recovery point', async () => {
    const { storage, backups } = fakeStorage()
    await expect(backups.removePoint('o', 'p', ['organizations/o/projects/x.pdf'])).rejects.toThrow(
      'Refusing to remove a file outside the recovery point.',
    )
    expect(storage.removeFiles).not.toHaveBeenCalled()
  })

  it('refuses to remove a listed file outside the downloads folder', async () => {
    const { storage, backups } = fakeStorage({
      listObjects: vi.fn(async () => [file('organizations/o/projects/1000-x.pdf')]),
    })
    await expect(backups.removeStaleDownloads('o', 2_000)).rejects.toThrow(
      'Refusing to remove a file outside the downloads folder.',
    )
    expect(storage.removeFiles).not.toHaveBeenCalled()
  })

  it('skips the download cleanup when storage is not configured', async () => {
    const { storage, backups } = fakeStorage({ isConfigured: vi.fn(() => false) })
    await expect(backups.removeStaleDownloads('o', 2_000)).resolves.toBeUndefined()
    expect(storage.listObjects).not.toHaveBeenCalled()
    expect(storage.removeFiles).not.toHaveBeenCalled()
  })

  it('removes only the download copies older than the cutoff', async () => {
    const downloads = 'organizations/o/backups/downloads'
    const { storage, backups } = fakeStorage({
      listObjects: vi.fn(async (_bucket: string, prefix: string) =>
        prefix === downloads
          ? [
              file(`${downloads}/1000-a.data.pwrp`),
              file(`${downloads}/3000-b.data.pwrp`),
              file(`${downloads}/x.data.pwrp`),
              folder(`${downloads}/1-nested`),
            ]
          : [],
      ),
    })
    await backups.removeStaleDownloads('o', 2_000)
    expect(storage.removeFiles).toHaveBeenCalledOnce()
    expect(storage.removeFiles).toHaveBeenCalledWith(expect.anything(), [
      `${downloads}/1000-a.data.pwrp`,
    ])
    const empty = fakeStorage({ listObjects: vi.fn(async () => []) })
    await empty.backups.removeStaleDownloads('o', 2_000)
    expect(empty.storage.removeFiles).not.toHaveBeenCalled()
  })

  it('maps a listed file to its copy inside the point', () => {
    expect(pointCopyPath('o', 'p', 'organizations/o/projects/a.pdf')).toBe(
      'organizations/o/backups/p/files/projects/a.pdf',
    )
  })
})
