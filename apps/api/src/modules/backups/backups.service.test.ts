import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { recoveryPointList } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuthorizedOperation } from './authorized-operation.harness'
import { type BackupStorage, BackupStorageUnavailableError } from './backup-storage'
import { BackupsService } from './backups.service'
import type { RecoveryPointCaptureService } from './recovery-point-capture.service'
import { checkRecoveryPoint } from './recovery-point-check'

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
    read: vi.fn(),
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

  it('download audits BACKUP_DOWNLOADED and returns two 120-second URLs', async () => {
    const { storage, service, audits } = setup()
    const before = Date.now()
    const result = await service.download(admin, pointId)
    const prefix = `organizations/${org}/backups/${pointId}`
    expect(storage.signedUrl).toHaveBeenCalledWith(
      `${prefix}/data.json.gz`,
      120,
      `recovery-point-${pointId}.json.gz`,
    )
    expect(storage.signedUrl).toHaveBeenCalledWith(
      `${prefix}/manifest.json`,
      120,
      `recovery-point-${pointId}.manifest.json`,
    )
    expect(result.dataUrl).toContain('data.json.gz')
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
  })

  it('download refuses a FAILED point with 409 and writes no audit', async () => {
    const { service, tx } = setup(pointRow({ status: 'FAILED' }))
    await expect(service.download(admin, pointId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'NOT_READY' },
    })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('download is not audited when signing fails', async () => {
    const { storage, service, tx } = setup()
    storage.signedUrl.mockResolvedValue(null)
    await expect(service.download(admin, pointId)).rejects.toMatchObject({
      status: 409,
      response: { code: 'DATA_FILE_MISSING' },
    })
    storage.signedUrl.mockRejectedValue(new BackupStorageUnavailableError())
    await expect(service.download(admin, pointId)).rejects.toMatchObject({ status: 503 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('an invalid point id answers 404', async () => {
    const { service, tx } = setup(null)
    await expect(service.verify(admin, 'not-a-uuid')).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    })
    expect(tx.recoveryPoint.findFirst).not.toHaveBeenCalled()
    await expect(service.download(admin, pointId)).rejects.toMatchObject({ status: 404 })
  })
})
