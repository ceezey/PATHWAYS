import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { Logger } from '@nestjs/common'
import { recoveryPointList } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuthorizedOperation } from './authorized-operation.harness'
import { type BackupStorage, BackupStorageUnavailableError } from './backup-storage'
import { BackupsService, DOWNLOAD_COPY_MAX_AGE_MS } from './backups.service'
import type { RecoveryPointCaptureService } from './recovery-point-capture.service'
import { checkRecoveryPoint } from './recovery-point-check'
import { decryptRecoveryPoint } from './recovery-point-encryption'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))
vi.mock('./recovery-point-check', () => ({ checkRecoveryPoint: vi.fn() }))

const org = 'b1400000-0000-4000-8000-00000000000a'
const pointId = 'b1400000-0000-4000-8000-000000000001'
const admin = {
  id: 'b1400000-0000-4000-8000-000000000002',
  aal: 'aal2',
  userId: 'b1400000-0000-4000-8000-000000000002',
  organizationId: org,
  fullName: 'Synthetic admin',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['backups.create', 'backups.restore'],
  assignedProjectIds: [],
} as ApplicationIdentity

const passphrase = 'correct horse battery staple'
const dataFile = Buffer.from('synthetic gzip bytes')
const manifestFile = Buffer.from('{"synthetic":"manifest"}')

const pointRow = (patch: Record<string, unknown> = {}) => ({
  id: pointId,
  organizationId: org,
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdById: admin.userId,
  createdBy: { id: admin.userId, fullName: 'Synthetic admin' },
  startedAt: new Date('2026-11-15T01:00:00.000Z'),
  capturedAt: new Date('2026-11-15T01:00:01.000Z'),
  completedAt: new Date('2026-11-15T01:00:03.000Z'),
  migrationName: '0091_backup_recovery',
  sizeBytes: 2048n,
  manifestSha256: 'a'.repeat(64),
  failureReason: null,
  ...patch,
})

function setup(row: Record<string, unknown> | null = pointRow()) {
  const tx = {
    recoveryPoint: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          pointRow(),
          pointRow({ id: 'b1400000-0000-4000-8000-000000000009', migrationName: '0090_x' }),
        ]),
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...pointRow(), ...data })),
    },
    organization: { findFirst: vi.fn().mockResolvedValue({ code: 'DEMO' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([{ migration: '0091_backup_recovery' }]),
  }
  fakeAuthorizedOperation(tx)
  const storage = {
    signedUrl: vi.fn(
      async (path: string): Promise<string | null> => `https://storage.invalid/${path}`,
    ),
    read: vi.fn(
      async (path: string): Promise<Buffer | null> =>
        path.endsWith('manifest.json') ? manifestFile : dataFile,
    ),
    write: vi.fn(async (_path: string, _body: Buffer, _type: string) => undefined),
    removeStaleDownloads: vi.fn(async (_orgId: string, _before: number) => undefined),
    listOrganizationFiles: vi.fn(),
    listPointFiles: vi.fn(),
  }
  const capture = { capture: vi.fn().mockResolvedValue(pointRow()) }
  const service = new BackupsService(
    {} as PrismaService,
    storage as unknown as BackupStorage,
    capture as unknown as RecoveryPointCaptureService,
  )
  const audits = () => tx.auditLog.create.mock.calls.map(([arg]) => arg.data)
  return { tx, storage, capture, service, audits }
}

beforeEach(() => vi.clearAllMocks())

describe('BackupsService', () => {
  it('list returns points newest first with the current migration and organization code', async () => {
    const { tx, service } = setup()
    const list = recoveryPointList.parse(await service.list(admin))
    expect(list).toMatchObject({
      currentMigration: '0091_backup_recovery',
      organizationCode: 'DEMO',
      fileMode: 'manifest',
    })
    expect(list.points.map((point) => point.status)).toEqual(['READY', 'INCOMPATIBLE'])
    expect(tx.recoveryPoint.findMany.mock.calls[0][0]).toMatchObject({
      where: { organizationId: org },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    })
    expect(vi.mocked(withAuthorizedOperation).mock.calls[0]?.slice(2, 3)).toEqual([
      'backups.create',
    ])
    expect(vi.mocked(withAuthorizedOperation).mock.calls[0]?.[4]).toEqual({
      alsoAllow: ['backups.restore'],
    })
  })

  it('create captures a manual point and returns it as READY', async () => {
    const { capture, service } = setup()
    await expect(service.create(admin)).resolves.toMatchObject({ id: pointId, status: 'READY' })
    expect(capture.capture).toHaveBeenCalledWith(admin, 'MANUAL')
  })

  it('verify marks a READY point UNAVAILABLE when its data file is missing', async () => {
    const { tx, service } = setup()
    vi.mocked(checkRecoveryPoint).mockResolvedValue({
      problem: 'DATA_FILE_MISSING',
      markUnavailable: true,
    })
    const result = await service.verify(admin, pointId)
    expect(result).toMatchObject({ problem: 'DATA_FILE_MISSING', point: { status: 'UNAVAILABLE' } })
    expect(tx.recoveryPoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pointId, organizationId: org },
        data: {
          status: 'UNAVAILABLE',
          failureReason: "This recovery point's data file is missing.",
        },
      }),
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('verify does not mark an older-migration point', async () => {
    const { tx, service } = setup()
    vi.mocked(checkRecoveryPoint).mockResolvedValue({
      problem: 'MIGRATION_MISMATCH',
      markUnavailable: false,
    })
    await expect(service.verify(admin, pointId)).resolves.toMatchObject({
      problem: 'MIGRATION_MISMATCH',
    })
    expect(tx.recoveryPoint.update).not.toHaveBeenCalled()
  })

  it('verify of an UNAVAILABLE point whose files are back sets it READY again', async () => {
    const { tx, service } = setup(pointRow({ status: 'UNAVAILABLE', failureReason: 'x' }))
    vi.mocked(checkRecoveryPoint).mockResolvedValue({
      problem: null,
      manifest: {} as never,
      data: Buffer.from(''),
      filesToRestore: [],
    })
    const result = await service.verify(admin, pointId)
    expect(vi.mocked(checkRecoveryPoint).mock.calls[0]?.[0].point.status).toBe('READY')
    expect(tx.recoveryPoint.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'READY', failureReason: null } }),
    )
    expect(result).toMatchObject({ problem: null, point: { status: 'READY' } })
  })

  it('verify answers 503 when storage is unavailable', async () => {
    const { service } = setup()
    vi.mocked(checkRecoveryPoint).mockRejectedValue(new BackupStorageUnavailableError())
    await expect(service.verify(admin, pointId)).rejects.toMatchObject({
      status: 503,
      response: { code: 'STORAGE_UNAVAILABLE' },
    })
  })

  it('download writes two encrypted copies, signs them for 120 seconds and audits once', async () => {
    const { storage, service, audits } = setup()
    const logs = [
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    ]
    storage.removeStaleDownloads.mockRejectedValue(new Error('storage down'))
    const before = Date.now()
    const result = await service.download(admin, pointId, { passphrase })
    const prefix = `organizations/${org}/backups/${pointId}`
    const downloads = `organizations/${org}/backups/downloads`
    expect(storage.read.mock.calls.map(([path]) => path).sort()).toEqual([
      `${prefix}/data.json.gz`,
      `${prefix}/manifest.json`,
    ])
    const writes = storage.write.mock.calls
    const data = writes.find(([path]) => path.endsWith('.data.pwrp'))
    const manifest = writes.find(([path]) => path.endsWith('.manifest.pwrp'))
    if (!data || !manifest) throw new Error('Both copies must be written.')
    const copyName = (suffix: string) => new RegExp(`^${downloads}/\\d+-[0-9a-f-]{36}\\.${suffix}$`)
    expect(data[0]).toMatch(copyName('data\\.pwrp'))
    expect(manifest[0]).toMatch(copyName('manifest\\.pwrp'))
    expect([data[2], manifest[2]]).toEqual(['application/gzip', 'application/gzip'])
    expect(decryptRecoveryPoint(data[1], passphrase)).toEqual(dataFile)
    expect(decryptRecoveryPoint(manifest[1], passphrase)).toEqual(manifestFile)
    expect(storage.signedUrl).toHaveBeenCalledWith(
      data[0],
      120,
      `recovery-point-${pointId}.json.gz.pwrp`,
    )
    expect(storage.signedUrl).toHaveBeenCalledWith(
      manifest[0],
      120,
      `recovery-point-${pointId}.manifest.json.pwrp`,
    )
    expect(result.dataUrl).toContain('.data.pwrp')
    expect(result.manifestUrl).toContain('.manifest.pwrp')
    expect(Date.parse(result.expiresAt) - before).toBeGreaterThanOrEqual(119_000)
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_DOWNLOADED',
        entityType: 'RECOVERY_POINT',
        entityId: pointId,
        changes: {
          pointType: 'MANUAL',
          capturedAt: '2026-11-15T01:00:01.000Z',
          expiresInSeconds: 120,
        },
      }),
    ])
    const leaked = JSON.stringify([
      audits(),
      storage.read.mock.calls,
      storage.signedUrl.mock.calls,
      writes.map(([path, , type]) => [path, type]),
      storage.removeStaleDownloads.mock.calls,
      logs.map((log) => log.mock.calls),
    ])
    expect(leaked).not.toContain(passphrase)
    expect(logs[0]).toHaveBeenCalledWith({ event: 'PATHWAYS_BACKUP_DOWNLOAD_CLEANUP_FAILED' })
  })

  it('download refuses a FAILED point with 409 and writes no audit', async () => {
    const { service, tx, storage } = setup(pointRow({ status: 'FAILED' }))
    await expect(service.download(admin, pointId, { passphrase })).rejects.toMatchObject({
      status: 409,
      response: { code: 'NOT_READY' },
    })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(storage.read).not.toHaveBeenCalled()
  })

  it('download answers 409 when a file is missing and writes and audits nothing', async () => {
    const { storage, service, tx } = setup()
    for (const missing of ['manifest.json', 'data.json.gz']) {
      storage.read.mockImplementation(async (path: string) =>
        path.endsWith(missing) ? null : dataFile,
      )
      await expect(service.download(admin, pointId, { passphrase })).rejects.toMatchObject({
        status: 409,
        response: { code: 'DATA_FILE_MISSING' },
      })
    }
    expect(storage.write).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each(['read', 'write', 'signedUrl'] as const)(
    'download answers 503 and audits nothing when storage fails on %s',
    async (step) => {
      const { storage, service, tx } = setup()
      storage[step].mockRejectedValue(new BackupStorageUnavailableError())
      await expect(service.download(admin, pointId, { passphrase })).rejects.toMatchObject({
        status: 503,
      })
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )

  it('download and list clear copies older than 15 minutes and survive a failed cleanup', async () => {
    const { storage, service } = setup()
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const cutoff = Date.now() - DOWNLOAD_COPY_MAX_AGE_MS
    await service.download(admin, pointId, { passphrase })
    await service.list(admin)
    expect(storage.removeStaleDownloads).toHaveBeenCalledTimes(2)
    for (const [orgId, before] of storage.removeStaleDownloads.mock.calls) {
      expect(orgId).toBe(org)
      expect(Math.abs(before - cutoff)).toBeLessThan(5_000)
    }
    storage.removeStaleDownloads.mockRejectedValue(new Error('storage down'))
    await expect(service.download(admin, pointId, { passphrase })).resolves.toHaveProperty(
      'dataUrl',
    )
    await expect(service.list(admin)).resolves.toHaveProperty('points')
    expect(logged).toHaveBeenCalledTimes(2)
  })

  it('an invalid point id answers 404', async () => {
    const { service, tx } = setup(null)
    await expect(service.verify(admin, 'not-a-uuid')).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    })
    expect(tx.recoveryPoint.findFirst).not.toHaveBeenCalled()
    await expect(service.download(admin, pointId, { passphrase })).rejects.toMatchObject({
      status: 404,
    })
  })
})
