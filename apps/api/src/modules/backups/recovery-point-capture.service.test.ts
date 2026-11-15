import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuthorizedOperation } from './authorized-operation.harness'
import type { BackupJobDatabase } from './backup-job-database'
import { type BackupStorage, BackupStorageUnavailableError } from './backup-storage'
import { RecoveryPointCaptureService } from './recovery-point-capture.service'
import { recoveryPointManifest, sha256Hex } from './recovery-point-manifest'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = 'b1300000-0000-4000-8000-00000000000a'
const otherOrg = 'b1300000-0000-4000-8000-00000000000b'
const userId = 'b1300000-0000-4000-8000-000000000001'
const pointId = 'b1300000-0000-4000-8000-000000000101'
const listed = {
  name: `organizations/${org}/projects/p/evidence/e/proof.png`,
  size: 5,
  checksum: 'abc',
  contentType: 'image/png',
}
const snapshotRow = {
  data: JSON.stringify({ format: 'pathways.recovery-point.v1', tables: {} }),
  rowCounts: '{"pathways.projects":1,"pathways.audit_logs":2}',
  migration: '0091_backup_recovery',
  capturedAt: '2026-11-15T01:00:00.000Z',
}
const user = {
  id: userId,
  aal: 'aal2',
  userId,
  organizationId: org,
  fullName: 'Synthetic admin',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['backups.create', 'backups.restore'],
  assignedProjectIds: [],
} as ApplicationIdentity
const busySql = Object.assign(new Error('x'), { code: 'P2010', meta: { code: '55P03' } })
const sqlText = (query: unknown) => String(query)

function setup(options: { fileMode?: 'manifest' | 'copy' } = {}) {
  vi.stubEnv('BACKUP_FILE_MODE', options.fileMode ?? 'manifest')
  const row = (patch: Record<string, unknown> = {}) => ({
    id: pointId,
    organizationId: org,
    pointType: 'MANUAL',
    status: 'READY',
    fileMode: options.fileMode ?? 'manifest',
    createdById: userId,
    createdBy: { id: userId, fullName: 'Synthetic admin' },
    ...patch,
  })
  const tx = {
    recoveryPoint: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: pointId }),
      update: vi.fn().mockImplementation(async ({ data }) => row(data)),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn(async (query: unknown) =>
      sqlText(query).includes('p91_capture_organization') ? [snapshotRow] : [],
    ),
  }
  fakeAuthorizedOperation(tx)
  const written = new Map<string, Buffer>()
  const storage = {
    listOrganizationFiles: vi.fn().mockResolvedValue([listed]),
    listPointFiles: vi.fn().mockResolvedValue([]),
    write: vi.fn(async (path: string, body: Buffer) => {
      written.set(path, body)
    }),
    copy: vi.fn().mockResolvedValue(undefined),
    removePoint: vi.fn().mockResolvedValue(undefined),
  }
  const jobTx = {
    $queryRaw: vi.fn(async (query: unknown, ...values: unknown[]): Promise<unknown[]> => {
      const text = sqlText(query)
      if (text.includes('p91_job_organizations')) return [{ id: org }, { id: otherOrg }]
      if (text.includes('p91_job_begin_point')) return [{ id: pointId }]
      if (text.includes('p91_capture_organization')) {
        if (values[0] === otherOrg) throw new Error('synthetic capture failure')
        return [snapshotRow]
      }
      if (text.includes('p91_job_retention_points')) return []
      if (text.includes('p91_job_delete_point')) return [{ deleted: true }]
      return []
    }),
    $executeRaw: vi.fn().mockResolvedValue(1),
  }
  const job = {
    withBackupJobContext: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(jobTx)),
  }
  const service = new RecoveryPointCaptureService(
    {} as PrismaService,
    storage as unknown as BackupStorage,
    job as unknown as BackupJobDatabase,
  )
  const audits = () => tx.auditLog.create.mock.calls.map(([arg]) => arg.data)
  return { tx, storage, written, job, jobTx, service, audits, row }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

describe('RecoveryPointCaptureService', () => {
  it('creates a READY manual point with the manifest, data file and one BACKUP_CREATED row', async () => {
    const { written, service, audits, tx } = setup()
    const point = await service.capture(user, 'MANUAL')
    expect(point.status).toBe('READY')
    const prefix = `organizations/${org}/backups/${pointId}`
    expect([...written.keys()]).toEqual([`${prefix}/data.json.gz`, `${prefix}/manifest.json`])
    const manifestBytes = written.get(`${prefix}/manifest.json`) as Buffer
    const manifest = recoveryPointManifest.parse(JSON.parse(manifestBytes.toString('utf8')))
    expect(manifest).toMatchObject({
      fileMode: 'manifest',
      files: [listed],
      pointId,
      organizationId: org,
    })
    expect(tx.recoveryPoint.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          manifestSha256: sha256Hex(manifestBytes),
          status: 'READY',
        }),
      }),
    )
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_CREATED',
        entityType: 'RECOVERY_POINT',
        entityId: pointId,
      }),
    ])
  })

  it('copy mode copies every listed file under files/ and adds their bytes to the size', async () => {
    const { storage, written, service, tx } = setup({ fileMode: 'copy' })
    await service.capture(user, 'MANUAL')
    expect(storage.copy).toHaveBeenCalledWith(
      listed.name,
      `organizations/${org}/backups/${pointId}/files/projects/p/evidence/e/proof.png`,
    )
    const bytes = [...written.values()].reduce((sum, body) => sum + body.length, 0)
    expect(tx.recoveryPoint.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sizeBytes: BigInt(bytes + listed.size) }),
      }),
    )
  })

  it('a storage failure marks the point FAILED, writes BACKUP_FAILED and answers 503', async () => {
    const { storage, service, tx, audits } = setup()
    storage.write.mockRejectedValue(new BackupStorageUnavailableError())
    await expect(service.capture(user, 'MANUAL')).rejects.toMatchObject({
      status: 503,
      response: { code: 'STORAGE_UNAVAILABLE' },
    })
    expect(tx.recoveryPoint.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'Backup storage was unavailable.',
        }),
      }),
    )
    expect(audits()).toContainEqual(
      expect.objectContaining({ action: 'BACKUP_FAILED', entityId: pointId }),
    )
  })

  it('a 55P03 from the capture function answers 409 BUSY and records the failure', async () => {
    const { tx, service, audits } = setup()
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('p91_capture_organization')) throw busySql
      return []
    })
    await expect(service.capture(user, 'MANUAL')).rejects.toMatchObject({
      status: 409,
      response: { code: 'BUSY' },
    })
    expect(audits()).toContainEqual(
      expect.objectContaining({
        action: 'BACKUP_FAILED',
        changes: expect.objectContaining({ code: 'BUSY' }),
      }),
    )
  })

  it('a database failure answers 500 CREATE_FAILED', async () => {
    const { tx, service } = setup()
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('p91_capture_organization')) throw new Error('jsonb too large')
      return []
    })
    await expect(service.capture(user, 'MANUAL')).rejects.toMatchObject({
      status: 500,
      response: { code: 'CREATE_FAILED' },
    })
  })

  it('capture runs in a RepeatableRead transaction with a 120 s timeout', async () => {
    const { service } = setup()
    await service.capture(user, 'MANUAL')
    const captureCall = vi
      .mocked(withAuthorizedOperation)
      .mock.calls.find(([, , , , options]) => options?.isolationLevel === 'RepeatableRead')
    expect(captureCall?.[4]).toMatchObject({
      isolationLevel: 'RepeatableRead',
      transactionTimeoutMs: 120_000,
      backupTimeout: true,
    })
  })

  it('a running CREATING point refuses with 409, inserts nothing and audits BACKUP_FAILED with code BUSY and a null entity', async () => {
    const { tx, service, audits } = setup()
    tx.recoveryPoint.findFirst.mockResolvedValue({ id: 'running' })
    await expect(service.capture(user, 'MANUAL')).rejects.toMatchObject({
      status: 409,
      response: { code: 'BUSY' },
    })
    expect(tx.recoveryPoint.create).not.toHaveBeenCalled()
    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'BACKUP_FAILED',
        entityId: null,
        changes: { pointType: 'MANUAL', code: 'BUSY' },
      }),
    ])
  })

  it('one older than 10 minutes is marked FAILED first', async () => {
    const { tx, service } = setup()
    const before = Date.now()
    await service.capture(user, 'MANUAL')
    const [stale] = tx.recoveryPoint.updateMany.mock.calls[0]
    expect(stale.where).toMatchObject({ organizationId: org, status: 'CREATING' })
    expect(before - stale.where.startedAt.lt.getTime()).toBeGreaterThanOrEqual(600_000 - 1_000)
    expect(stale.data).toMatchObject({
      status: 'FAILED',
      failureReason: 'The backup did not finish.',
    })
    expect(stale.data.completedAt).toBeInstanceOf(Date)
    expect(tx.recoveryPoint.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.recoveryPoint.findFirst.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('the job ledger answers 409 BUSY when p91_job_begin_point returns null', async () => {
    const { jobTx, service } = setup()
    jobTx.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('p91_job_begin_point') ? [{ id: null }] : [],
    )
    await expect(service.captureAutomatic(org)).rejects.toMatchObject({
      status: 409,
      response: { code: 'BUSY' },
    })
  })

  it('pre-restore capture allows backups.restore', async () => {
    const { service } = setup()
    await service.capture(user, 'PRE_RESTORE')
    for (const [, , permission, , options] of vi.mocked(withAuthorizedOperation).mock.calls) {
      expect(permission).toBe('backups.create')
      expect(options?.alsoAllow).toEqual(['backups.restore'])
    }
  })

  it('retention keeps the 10 newest READY manual points and removes only their own files', async () => {
    const { tx, storage, service } = setup()
    const at = (minutes: number) => new Date(Date.UTC(2026, 10, 15, 0, minutes))
    const ready = Array.from({ length: 12 }, (_, index) => ({
      id: `ready-${index}`,
      status: 'READY',
      startedAt: at(60 - index),
    }))
    tx.recoveryPoint.findMany.mockResolvedValue([
      ...ready,
      { id: 'failed-old', status: 'FAILED', startedAt: at(1) },
    ])
    storage.listPointFiles.mockImplementation(async (_org: string, id: string) =>
      id === pointId ? [] : [{ name: `organizations/${org}/backups/${id}/data.json.gz` }],
    )
    await service.capture(user, 'MANUAL')
    const retired = tx.recoveryPoint.deleteMany.mock.calls.map(([arg]) => arg.where.id)
    expect(retired).toEqual(['ready-10', 'ready-11', 'failed-old'])
    for (const id of retired)
      expect(storage.removePoint).toHaveBeenCalledWith(org, id, [
        `organizations/${org}/backups/${id}/data.json.gz`,
      ])

    vi.clearAllMocks()
    tx.recoveryPoint.findMany.mockResolvedValue([
      ...ready.slice(0, 3),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `failed-${index}`,
        status: 'FAILED',
        startedAt: at(20 - index),
      })),
    ])
    await service.capture(user, 'MANUAL')
    expect(tx.recoveryPoint.deleteMany).not.toHaveBeenCalled()
  })

  it('pre-restore retention keeps 3 and never retires the point being restored', async () => {
    const { tx, service } = setup()
    const at = (minutes: number) => new Date(Date.UTC(2026, 10, 15, 0, minutes))
    tx.recoveryPoint.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `pre-${index}`,
        status: 'READY',
        startedAt: at(60 - index),
      })),
    )
    await service.capture(user, 'PRE_RESTORE', 'pre-4')
    expect(tx.recoveryPoint.deleteMany.mock.calls.map(([arg]) => arg.where.id)).toEqual(['pre-3'])
  })

  it('retention stops when a row delete removes nothing, after that point files only', async () => {
    const { tx, storage, service } = setup()
    const at = (minutes: number) => new Date(Date.UTC(2026, 10, 15, 0, minutes))
    tx.recoveryPoint.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `ready-${index}`,
        status: 'READY',
        startedAt: at(60 - index),
      })),
    )
    tx.recoveryPoint.deleteMany.mockResolvedValue({ count: 0 })
    await expect(service.capture(user, 'MANUAL')).resolves.toMatchObject({ status: 'READY' })
    expect(tx.recoveryPoint.deleteMany).toHaveBeenCalledTimes(1)
    expect(storage.removePoint.mock.calls.map(([, id]) => id)).toEqual(['ready-10'])
  })

  it('job retention stops when p91_job_delete_point deletes nothing', async () => {
    const { jobTx, service } = setup()
    const ids = ['b1300000-0000-4000-8000-000000000201', 'b1300000-0000-4000-8000-000000000202']
    jobTx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlText(query)
      if (text.includes('p91_job_begin_point')) return [{ id: pointId }]
      if (text.includes('p91_capture_organization')) return [snapshotRow]
      if (text.includes('p91_job_retention_points')) return ids.map((id) => ({ id }))
      if (text.includes('p91_job_delete_point')) return [{ deleted: false }]
      return []
    })
    await service.captureAutomatic(org)
    const deletes = jobTx.$queryRaw.mock.calls.filter(([query]) =>
      sqlText(query).includes('p91_job_delete_point'),
    )
    expect(deletes).toHaveLength(1)
  })

  it('a retention failure does not fail the backup', async () => {
    const { tx, service } = setup()
    tx.recoveryPoint.findMany.mockRejectedValue(new Error('synthetic retention failure'))
    await expect(service.capture(user, 'MANUAL')).resolves.toMatchObject({ status: 'READY' })
  })

  it('the daily job captures one AUTOMATIC point per organization on the job login and counts failures', async () => {
    const { tx, job, jobTx, service } = setup()
    await expect(service.runDaily()).resolves.toEqual({ state: 'COMPLETED', created: 1, failed: 1 })
    expect(withAuthorizedOperation).not.toHaveBeenCalled()
    expect(tx.recoveryPoint.create).not.toHaveBeenCalled()
    expect(tx.recoveryPoint.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(job.withBackupJobContext).toHaveBeenCalled()
    for (const [query] of [...jobTx.$queryRaw.mock.calls, ...jobTx.$executeRaw.mock.calls])
      expect(sqlText(query)).toMatch(/p91_job_[a-z_]+|p91_capture_organization|set_config/)
    const executed = jobTx.$executeRaw.mock.calls.map(([query]) => sqlText(query))
    expect(executed.some((text) => text.includes('p91_job_finish_point'))).toBe(true)
    expect(executed.some((text) => text.includes('p91_job_fail_point'))).toBe(true)
  })

  it('job retention deletes only the ids p91_job_retention_points returns, after their files', async () => {
    const { jobTx, storage, service } = setup()
    const old = 'b1300000-0000-4000-8000-000000000201'
    jobTx.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlText(query)
      if (text.includes('p91_job_begin_point')) return [{ id: pointId }]
      if (text.includes('p91_capture_organization')) return [snapshotRow]
      if (text.includes('p91_job_retention_points')) return [{ id: old }]
      if (text.includes('p91_job_delete_point')) return [{ deleted: true }]
      return []
    })
    storage.listPointFiles.mockImplementation(async (_org: string, id: string) =>
      id === old ? [{ name: `organizations/${org}/backups/${old}/data.json.gz` }] : [],
    )
    await service.captureAutomatic(org)
    const deletes = jobTx.$queryRaw.mock.calls.filter(([query]) =>
      sqlText(query).includes('p91_job_delete_point'),
    )
    expect(deletes.map(([, , id]) => id)).toEqual([old])
    expect(storage.removePoint).toHaveBeenCalledWith(org, old, [
      `organizations/${org}/backups/${old}/data.json.gz`,
    ])
    expect(storage.removePoint.mock.invocationCallOrder.at(-1)).toBeLessThan(
      jobTx.$queryRaw.mock.invocationCallOrder.at(-1) ?? 0,
    )
  })
})
