import 'reflect-metadata'

import { gzipSync } from 'node:zlib'
import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuthorizedOperation } from './authorized-operation.harness'
import { type BackupStorage, BackupStorageUnavailableError } from './backup-storage'
import { BackupsService } from './backups.service'
import type { RecoveryPointCaptureService } from './recovery-point-capture.service'
import { checkRecoveryPoint } from './recovery-point-check'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))
vi.mock('./recovery-point-check', () => ({ checkRecoveryPoint: vi.fn() }))

const org = 'b1500000-0000-4000-8000-00000000000a'
const pointId = 'b1500000-0000-4000-8000-000000000001'
const preId = 'b1500000-0000-4000-8000-000000000002'
const admin = {
  id: 'b1500000-0000-4000-8000-000000000003',
  aal: 'aal2',
  userId: 'b1500000-0000-4000-8000-000000000003',
  organizationId: org,
  fullName: 'Synthetic admin',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['backups.create', 'backups.restore'],
  assignedProjectIds: [],
} as ApplicationIdentity
const snapshot = { format: 'pathways.recovery-point.v1', tables: {} }
const rowCounts = { 'pathways.projects': 2, 'pathways.audit_logs': 4 }
const restoredCounts = { 'pathways.projects': 2 }
const changedFile = {
  name: `organizations/${org}/projects/p/evidence/e/changed.png`,
  size: 5,
  checksum: 'abc',
  contentType: 'image/png',
}
const missingFile = {
  ...changedFile,
  name: `organizations/${org}/projects/p/evidence/e/missing.png`,
}
const sqlError = (code: string) => Object.assign(new Error('x'), { code: 'P2010', meta: { code } })
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
const sound = (fileMode: 'manifest' | 'copy' = 'manifest', filesToRestore = [] as unknown[]) => ({
  problem: null,
  manifest: { fileMode, rowCounts, migration: '0091_backup_recovery' } as never,
  data: gzipSync(Buffer.from(JSON.stringify(snapshot))),
  filesToRestore: filesToRestore as never,
})

function setup() {
  const order: string[] = []
  const tx = {
    recoveryPoint: {
      findFirst: vi.fn(
        async ({ where }: { where: { id?: string } }): Promise<unknown> =>
          where.id ? pointRow() : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    organization: { findFirst: vi.fn().mockResolvedValue({ code: 'DEMO' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn(async (query: unknown): Promise<unknown[]> => {
      const text = String(query)
      if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
      if (text.includes('transaction_isolation')) return [{ level: 'read committed' }]
      if (text.includes('p91_restore_organization')) {
        order.push('restore')
        return [{ counts: JSON.stringify(restoredCounts) }]
      }
      return []
    }),
  }
  fakeAuthorizedOperation(tx)
  vi.mocked(checkRecoveryPoint).mockResolvedValue(sound())
  const storage = {
    read: vi.fn(async (path: string) => {
      if (path === missingFile.name) return null
      return Buffer.from(`bytes of ${path}`)
    }),
    copy: vi.fn(async () => {
      order.push('copy')
    }),
    overwrite: vi.fn(async () => {
      order.push('overwrite')
    }),
    write: vi.fn(),
    removePoint: vi.fn(),
    listOrganizationFiles: vi.fn(),
    listPointFiles: vi.fn(),
  }
  const capture = {
    capture: vi.fn(async () => {
      order.push('pre-restore')
      return pointRow({ id: preId, pointType: 'PRE_RESTORE' })
    }),
    retainPreRestore: vi.fn(async () => {
      order.push('retention')
    }),
  }
  const service = new BackupsService(
    {} as PrismaService,
    storage as unknown as BackupStorage,
    capture as unknown as RecoveryPointCaptureService,
  )
  const audits = () => tx.auditLog.create.mock.calls.map(([arg]) => arg.data)
  return { tx, storage, capture, service, audits, order }
}

beforeEach(() => vi.clearAllMocks())

describe('BackupsService.restore', () => {
  it('restores: pre-restore point first, then the database function with the manifest counts, then one BACKUP_RESTORED row', async () => {
    const { tx, capture, service, audits, order } = setup()
    const result = await service.restore(admin, pointId, { organizationCode: 'DEMO' })
    expect(order).toEqual(['pre-restore', 'restore', 'retention'])
    expect(capture.capture).toHaveBeenCalledWith(admin, 'PRE_RESTORE')
    expect(capture.retainPreRestore).toHaveBeenCalledWith(admin, pointId)
    const call = tx.$queryRaw.mock.calls.find(([query]) =>
      String(query).includes('p91_restore_organization'),
    ) as unknown[]
    expect(call[1]).toBe(org)
    expect(JSON.parse(call[2] as string)).toEqual(snapshot)
    expect(call[3]).toBe(JSON.stringify(rowCounts))
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_RESTORED',
        entityType: 'RECOVERY_POINT',
        entityId: pointId,
        changes: expect.objectContaining({
          preRestorePointId: preId,
          rowCounts: restoredCounts,
          filesRestored: 0,
        }),
      }),
    ])
    expect(result).toMatchObject({
      preRestorePointId: preId,
      rowCounts: restoredCounts,
      filesRestored: 0,
      point: { id: pointId, status: 'READY' },
    })
    const restoreOptions = vi
      .mocked(withAuthorizedOperation)
      .mock.calls.find(([, , , , options]) => options?.backupTimeout)?.[4]
    expect(restoreOptions).toEqual({ transactionTimeoutMs: 120_000, backupTimeout: true })
  })

  it('a failed restore runs no pre-restore retention, so retries never evict an undo point', async () => {
    const { tx, capture, service } = setup()
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = String(query)
      if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
      if (text.includes('transaction_isolation')) return [{ level: 'read committed' }]
      if (text.includes('p91_restore_organization')) throw sqlError('55P03')
      return []
    })
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(capture.capture).toHaveBeenCalled()
    expect(capture.retainPreRestore).not.toHaveBeenCalled()
  })

  it('refuses to restore outside a read committed transaction', async () => {
    const { tx, service, order } = setup()
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = String(query)
      if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
      if (text.includes('transaction_isolation')) return [{ level: 'repeatable read' }]
      return []
    })
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 500, response: { code: 'RESTORE_FAILED' } })
    expect(order).not.toContain('restore')
  })

  it('a wrong organization code refuses with 400, audits CODE_MISMATCH and never captures', async () => {
    const { capture, service, audits } = setup()
    await expect(
      service.restore(admin, pointId, { organizationCode: 'demo' }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'CODE_MISMATCH', message: 'The organization code does not match.' },
    })
    expect(capture.capture).not.toHaveBeenCalled()
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_RESTORE_REFUSED',
        entityId: pointId,
        changes: { code: 'CODE_MISMATCH' },
      }),
    ])
    expect(JSON.stringify(audits())).not.toContain('organizationCode')
  })

  it('an invisible point answers 404 and audits a null entity', async () => {
    const { tx, service, audits } = setup()
    tx.recoveryPoint.findFirst.mockResolvedValue(null)
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'NOT_FOUND' } })
    expect(audits()).toEqual([
      expect.objectContaining({ entityId: null, changes: { code: 'NOT_FOUND' } }),
    ])
  })

  it('a running backup refuses with 409 BUSY before any check', async () => {
    const { tx, service, audits } = setup()
    tx.recoveryPoint.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id ? pointRow() : { id: 'running' },
    )
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'BUSY' } })
    expect(checkRecoveryPoint).not.toHaveBeenCalled()
    expect(audits()).toEqual([expect.objectContaining({ changes: { code: 'BUSY' } })])
  })

  it.each([
    ['DATA_FILE_MISSING', true],
    ['CHECKSUM_MISMATCH', true],
    ['OTHER_ORGANIZATION', true],
    ['MIGRATION_MISMATCH', false],
    ['FILE_MISSING', true],
    ['FILE_CHANGED', true],
  ] as const)(
    '%s refuses with 409, audits BACKUP_RESTORE_REFUSED and takes no pre-restore point',
    async (problem, markUnavailable) => {
      const { tx, capture, service, audits } = setup()
      vi.mocked(checkRecoveryPoint).mockResolvedValue({ problem, markUnavailable })
      await expect(
        service.restore(admin, pointId, { organizationCode: 'DEMO' }),
      ).rejects.toMatchObject({ status: 409, response: { code: problem } })
      expect(capture.capture).not.toHaveBeenCalled()
      expect(audits()).toEqual([
        expect.objectContaining({ action: 'BACKUP_RESTORE_REFUSED', changes: { code: problem } }),
      ])
      expect(tx.recoveryPoint.update).toHaveBeenCalledTimes(markUnavailable ? 1 : 0)
    },
  )

  it('storage unavailable refuses with 503 STORAGE_UNAVAILABLE', async () => {
    const { service, audits } = setup()
    vi.mocked(checkRecoveryPoint).mockRejectedValue(new BackupStorageUnavailableError())
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 503, response: { code: 'STORAGE_UNAVAILABLE' } })
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_RESTORE_REFUSED',
        changes: { code: 'STORAGE_UNAVAILABLE' },
      }),
    ])
  })

  it('a 55P03 from the restore function answers 409 BUSY, not 403', async () => {
    const { tx, service, audits } = setup()
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = String(query)
      if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
      if (text.includes('transaction_isolation')) return [{ level: 'read committed' }]
      if (text.includes('p91_restore_organization')) throw sqlError('55P03')
      return []
    })
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'BUSY' } })
    expect(audits()).toContainEqual(
      expect.objectContaining({ action: 'BACKUP_RESTORE_REFUSED', changes: { code: 'BUSY' } }),
    )
  })

  it.each([
    ['22023', 409, 'INCOMPATIBLE', 'BACKUP_RESTORE_REFUSED'],
    ['23514', 500, 'COUNT_MISMATCH', 'BACKUP_RESTORE_FAILED'],
    ['XX000', 500, 'RESTORE_FAILED', 'BACKUP_RESTORE_FAILED'],
  ])(
    'a %s from the restore function answers %i %s and audits %s',
    async (state, status, code, action) => {
      const { tx, service, audits } = setup()
      tx.$queryRaw.mockImplementation(async (query: unknown) => {
        const text = String(query)
        if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
        if (text.includes('transaction_isolation')) return [{ level: 'read committed' }]
        if (text.includes('p91_restore_organization')) throw sqlError(state)
        return []
      })
      await expect(
        service.restore(admin, pointId, { organizationCode: 'DEMO' }),
      ).rejects.toMatchObject({ status, response: { code } })
      expect(audits()).toContainEqual(expect.objectContaining({ action, changes: { code } }))
      if (code === 'COUNT_MISMATCH')
        await expect(
          service.restore(admin, pointId, { organizationCode: 'DEMO' }),
        ).rejects.toMatchObject({
          response: { message: 'The restore failed and was undone. Nothing was changed.' },
        })
    },
  )

  it('a fault inside the restore function logs its SQL state', async () => {
    const { tx, service } = setup()
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = String(query)
      if (text.includes('p91_current_migration')) return [{ migration: '0091_backup_recovery' }]
      if (text.includes('transaction_isolation')) return [{ level: 'read committed' }]
      if (text.includes('p91_restore_organization')) throw sqlError('23502')
      return []
    })
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 500, response: { code: 'RESTORE_FAILED' } })
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'PATHWAYS_BACKUP_RESTORE_FAILED',
        cause: expect.stringContaining('23502'),
      }),
    )
  })

  it('a database fault after the restore function answers 500 RESTORE_FAILED, not 403', async () => {
    const { tx, service } = setup()
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    tx.auditLog.create.mockImplementation(async ({ data }: { data: { action: string } }) => {
      if (data.action === 'BACKUP_RESTORED')
        throw Object.assign(new Error('synthetic audit write failure'), { code: 'P2028' })
      return {}
    })
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 500, response: { code: 'RESTORE_FAILED' } })
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PATHWAYS_BACKUP_RESTORE_FAILED', cause: 'P2028' }),
    )
  })

  it('a failed pre-restore capture changes nothing and audits PRE_RESTORE_FAILED', async () => {
    const { capture, service, audits, order } = setup()
    capture.capture.mockRejectedValue(
      new ServiceUnavailableException({ message: 'x', code: 'STORAGE_UNAVAILABLE' }),
    )
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 503, response: { code: 'PRE_RESTORE_FAILED' } })
    expect(order).not.toContain('restore')
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_RESTORE_FAILED',
        changes: { code: 'PRE_RESTORE_FAILED' },
      }),
    ])
  })

  it('copy mode copies a missing file back, overwrites a changed one, never removes, and runs before the database transaction', async () => {
    const { storage, service, order } = setup()
    vi.mocked(checkRecoveryPoint).mockResolvedValue(sound('copy', [missingFile, changedFile]))
    const result = await service.restore(admin, pointId, { organizationCode: 'DEMO' })
    const copyOf = (name: string) =>
      `organizations/${org}/backups/${pointId}/files/${name.slice(`organizations/${org}/`.length)}`
    expect(storage.copy).toHaveBeenCalledWith(copyOf(missingFile.name), missingFile.name)
    expect(storage.overwrite).toHaveBeenCalledWith(
      changedFile.name,
      Buffer.from(`bytes of ${copyOf(changedFile.name)}`),
      'image/png',
    )
    expect(storage.removePoint).not.toHaveBeenCalled()
    expect(order).toEqual(['pre-restore', 'copy', 'overwrite', 'restore', 'retention'])
    expect(result.filesRestored).toBe(2)
  })

  it('a file that cannot be brought back answers 503 and leaves the database alone', async () => {
    const { storage, service, audits, order } = setup()
    vi.mocked(checkRecoveryPoint).mockResolvedValue(sound('copy', [missingFile]))
    storage.copy.mockRejectedValue(new BackupStorageUnavailableError())
    await expect(
      service.restore(admin, pointId, { organizationCode: 'DEMO' }),
    ).rejects.toMatchObject({ status: 503, response: { code: 'FILE_RESTORE_FAILED' } })
    expect(order).not.toContain('restore')
    expect(audits()).toContainEqual(
      expect.objectContaining({
        action: 'BACKUP_RESTORE_FAILED',
        changes: { code: 'FILE_RESTORE_FAILED', filesRestored: 0 },
      }),
    )
  })

  it('manifest mode never writes to storage during restore', async () => {
    const { storage, service } = setup()
    await service.restore(admin, pointId, { organizationCode: 'DEMO' })
    expect(storage.copy).not.toHaveBeenCalled()
    expect(storage.overwrite).not.toHaveBeenCalled()
    expect(storage.write).not.toHaveBeenCalled()
    expect(storage.removePoint).not.toHaveBeenCalled()
  })
})
