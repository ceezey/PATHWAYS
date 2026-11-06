// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  batch,
  batchId,
  formId,
  organizationId,
  projectId,
  service,
  storage,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { rerunClientImportId } from './import-rerun.service'

const newFormId = '40000000-0000-4000-8000-000000000044'
const source = Buffer.from('score\n2.5\n', 'utf8')
const sourceChecksum = createHash('sha256').update(source).digest('hex')
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// The old batch is MAPPED on version 1; the newest published version of its code is 2.
function arrange(
  patch: Record<string, unknown> = {},
  newest = { id: newFormId, version: 2 },
  byKey: (key: string) => unknown = () => null,
) {
  const old = batch({ sourceChecksum, ...patch })
  let created: { id: string; clientImportId: string } | undefined
  tx.digitalForm.findFirst.mockResolvedValue(newest)
  tx.dataImportBatch.findFirst.mockImplementation(async ({ where }) => {
    if ('clientImportId' in where) return byKey(where.clientImportId)
    if (where.id === batchId) return old
    return batch({
      id: created?.id,
      formId: newFormId,
      formVersion: 2,
      status: 'UPLOADING',
      storageStatus: 'RESERVED',
      mappingRevision: 0,
      totalRows: 0,
      sourceChecksum,
    })
  })
  tx.dataImportBatch.findUnique.mockImplementation(async ({ where }) =>
    where.id === batchId
      ? old
      : batch({ id: created?.id, formId: newFormId, formVersion: 2, status: 'UPLOADING' }),
  )
  tx.dataImportBatch.create.mockImplementation(async ({ data }) => {
    created = data
    return data
  })
  tx.metadataMapping.findMany.mockResolvedValue([])
  tx.auditLog.findFirst.mockResolvedValue(null)
  storage.downloadPrivateFile.mockResolvedValue(source)
  storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })
  return () => created
}

describe('re-run a staged import against a newer form version', () => {
  useImportsHarness()

  it('uploader re-runs and gets a new batch on the new version', async () => {
    const created = arrange()

    const result = await service.rerun(actor, projectId, batchId, { formId: newFormId })

    expect(storage.downloadPrivateFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`/imports/${batchId}/`),
    )
    expect(tx.dataImportBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        projectId,
        formId: newFormId,
        formVersion: 2,
        originalFileName: 'scores.csv',
        sourceChecksum,
      }),
    })
    expect(created()?.clientImportId).toMatch(uuidV4)
    expect(result.id).toBe(created()?.id)
    expect(result.id).not.toBe(batchId)
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`/imports/${created()?.id}/${sourceChecksum}.csv`),
      source,
      'text/csv',
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'IMPORT_RERUN',
        changes: { sourceBatchId: batchId, newBatchId: created()?.id, formVersion: 2 },
      }),
    })
  })

  it.each([
    ['audited', { id: 'audit' }, 0],
    ['not audited because the first audit transaction failed', null, 1],
  ])('a retry returns the same new batch (%s)', async (_name, audit, auditWrites) => {
    const created = arrange()
    await service.rerun(actor, projectId, batchId, { formId: newFormId })
    const first = created()
    expect(first).toBeDefined()
    vi.clearAllMocks()
    const existing = batch({
      id: first?.id,
      formId: newFormId,
      formVersion: 2,
      status: 'UPLOADED',
      clientImportId: first?.clientImportId,
      sourceChecksum,
    })
    tx.digitalForm.findFirst.mockResolvedValue({ id: newFormId, version: 2 })
    tx.dataImportBatch.findFirst.mockImplementation(async ({ where }) =>
      where.id === batchId ? batch({ sourceChecksum }) : existing,
    )
    tx.dataImportBatch.findUnique.mockImplementation(async ({ where }) =>
      where.id === batchId ? batch({ sourceChecksum }) : existing,
    )
    storage.downloadPrivateFile.mockResolvedValue(source)
    tx.auditLog.findFirst.mockResolvedValue(audit)

    const result = await service.rerun(actor, projectId, batchId, { formId: newFormId })

    expect(tx.dataImportBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientImportId: first?.clientImportId }),
      }),
    )
    expect(result.id).toBe(first?.id)
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    expect(tx.auditLog.create).toHaveBeenCalledTimes(auditWrites)
  })

  it('moves to the next attempt key after a FAILED first attempt and audits the new batch', async () => {
    const failedKey = rerunClientImportId(batchId, newFormId, 0)
    const created = arrange({}, undefined, (key) =>
      key === failedKey ? { status: 'FAILED' } : null,
    )

    await service.rerun(actor, projectId, batchId, { formId: newFormId })

    expect(created()?.clientImportId).toBe(rerunClientImportId(batchId, newFormId, 1))
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'IMPORT_RERUN',
        changes: { sourceBatchId: batchId, newBatchId: created()?.id, formVersion: 2 },
      }),
    })
  })

  it('refuses with 409 and no download when all five attempt keys are FAILED', async () => {
    const failed = [0, 1, 2, 3, 4].map((n) => rerunClientImportId(batchId, newFormId, n))
    arrange({}, undefined, (key) => (failed.includes(key) ? { status: 'FAILED' } : null))

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
  })

  it('does not audit when the returned batch is FAILED', async () => {
    const key = rerunClientImportId(batchId, newFormId, 0)
    const existing = batch({
      id: '50000000-0000-4000-8000-0000000000f1',
      formId: newFormId,
      formVersion: 2,
      status: 'FAILED',
      clientImportId: key,
      sourceChecksum,
    })
    // The pre-check sees the key as usable (first lookup); upload then finds the batch FAILED.
    let lookups = 0
    arrange({}, undefined, () => (++lookups === 1 ? { status: 'UPLOADING' } : existing))
    const lookup = tx.dataImportBatch.findFirst.getMockImplementation()
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      args.where.id === existing.id ? existing : lookup?.(args),
    )
    tx.dataImportBatch.findUnique.mockImplementation(async ({ where }) =>
      where.id === batchId ? batch({ sourceChecksum }) : existing,
    )

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses a user who is not the uploader before any download', async () => {
    arrange({ uploadedById: '20000000-0000-4000-8000-0000000000bb' })

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('refuses an old batch that has already been validated', async () => {
    arrange({ status: 'VALIDATED' })

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it.each([
    ['the same version', { id: formId, version: 1 }, formId],
    ['a form that is not the newest published version', { id: newFormId, version: 3 }, formId],
  ])('refuses %s', async (_name, newest, requested) => {
    arrange({}, newest)

    await expect(
      service.rerun(actor, projectId, batchId, { formId: requested }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('refuses a form with no published version', async () => {
    arrange()
    tx.digitalForm.findFirst.mockResolvedValue(null)

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('is unavailable when private storage is not configured', async () => {
    arrange()
    storage.isConfigured.mockReturnValueOnce(false)

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('refuses a stored source whose checksum changed', async () => {
    arrange()
    storage.downloadPrivateFile.mockResolvedValue(Buffer.from('other\n1\n', 'utf8'))

    await expect(
      service.rerun(actor, projectId, batchId, { formId: newFormId }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
  })

  it('leaves the old batch and its rows untouched', async () => {
    const created = arrange()

    await service.rerun(actor, projectId, batchId, { formId: newFormId })

    for (const [args] of tx.dataImportBatch.update.mock.calls) {
      expect(args.where.id).toBe(created()?.id)
    }
    expect(tx.dataImportRow.update).not.toHaveBeenCalled()
    expect(tx.dataImportRow.updateMany).not.toHaveBeenCalled()
    for (const [args] of tx.dataImportRow.createMany.mock.calls) {
      for (const row of args.data) expect(row.importBatchId).toBe(created()?.id)
    }
  })
})

describe('rerunClientImportId', () => {
  const oldBatch = '50000000-0000-4000-8000-000000000005'

  it('is a stable v4-shaped UUID for a fixed input', () => {
    expect(rerunClientImportId(oldBatch, newFormId, 0)).toBe('8b4fa773-ad66-4901-afb4-f83a57d8135b')
    expect(rerunClientImportId(oldBatch, newFormId, 0)).toBe(
      rerunClientImportId(oldBatch, newFormId, 0),
    )
    expect(rerunClientImportId(oldBatch, newFormId, 3)).toMatch(uuidV4)
  })

  it('gives a different key for every attempt', () => {
    const keys = [0, 1, 2, 3, 4].map((n) => rerunClientImportId(oldBatch, newFormId, n))
    expect(new Set(keys).size).toBe(5)
  })
})
