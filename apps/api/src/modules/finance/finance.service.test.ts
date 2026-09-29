import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { StorageService } from '../storage/storage.service'
import { FinanceService } from './finance.service'
const state = vi.hoisted(() => ({
  actor: undefined as unknown,
  tx: undefined as unknown,
  lostCommit: false,
  operations: 0,
  reader: vi.fn(),
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = state.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission as never))
      throw new ForbiddenException('Fresh grant required.')
    state.operations++
    const result = await work(state.tx, actor)
    if (state.lostCommit && state.operations === 2) throw Error('Commit response lost')
    return result
  },
}))
vi.mock('@pathways/config', async (original) => ({
  ...(await original<object>()),
  readApiEnv: () => ({
    SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-credential',
  }),
}))
vi.mock('../storage/private-inspection-reader', () => ({
  createPrivateInspectionReader: () => state.reader,
}))
const projectId = '10000000-0000-4000-8000-000000000001'
const id = '20000000-0000-4000-8000-000000000002'
const org = '30000000-0000-4000-8000-000000000003'
const actor: ApplicationIdentity = {
  id,
  aal: 'aal2',
  userId: id,
  organizationId: org,
  fullName: 'Fictional submitter',
  roles: ['PROJECT_OFFICER'],
  permissions: ['expenses.evidence.submit'],
  assignedProjectIds: [projectId],
}
const pending = {
  id,
  projectId,
  status: 'PENDING',
  receiptEvidenceId: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
}
const tx = {
  project: { findFirst: vi.fn() },
  budgetExpenseEntry: { findFirst: vi.fn() },
  evidenceMedia: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
}
const storage = { uploadPrivateFile: vi.fn(), deleteFile: vi.fn() }
const service = new FinanceService({} as PrismaService, storage as unknown as StorageService)
const bytes = Buffer.from('%PDF-private-synthetic')
const file = { buffer: bytes, size: bytes.length, mimetype: 'application/pdf' }
describe('financial receipt finalization recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx
    state.operations = 0
    state.lostCommit = false
    state.reader.mockResolvedValue(bytes)
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([{ value: pending }])
    storage.uploadPrivateFile.mockResolvedValue(undefined)
    storage.deleteFile.mockResolvedValue(undefined)
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })
  it('accepts uppercase UUIDs and uses canonical scope and key through receipt finalization', async () => {
    const lowerProject = 'a0000000-0000-4000-8000-00000000000a'
    const lowerExpense = 'b0000000-0000-4000-8000-00000000000b'
    const scopedActor = { ...actor, assignedProjectIds: [lowerProject] }
    state.actor = scopedActor
    tx.$queryRaw
      .mockResolvedValueOnce([{ value: { ...pending, id: lowerExpense, projectId: lowerProject } }])
      .mockResolvedValueOnce([{ value: { id: lowerExpense } }])
    await service.uploadReceipt(
      scopedActor,
      lowerProject.toUpperCase(),
      lowerExpense.toUpperCase(),
      { expectedUpdatedAt: pending.updatedAt },
      file,
    )
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { organizationId: org, archivedAt: null, id: { in: [lowerProject] } },
          { id: lowerProject },
        ],
      },
      select: { id: true },
    })
    const key = storage.uploadPrivateFile.mock.calls[0][1]
    expect(key).toMatch(
      new RegExp(
        `^organizations/${org}/projects/${lowerProject}/evidence/[0-9a-f-]+/receipt\\.pdf$`,
      ),
    )
    expect(state.reader).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: lowerProject, objectKey: key }),
    )
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([lowerProject, lowerExpense])
    expect(tx.$queryRaw.mock.calls[1].slice(1, 3)).toEqual([lowerProject, lowerExpense])
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })
  it('preserves the allocated object after committed finalization loses its response', async () => {
    state.lostCommit = true
    await expect(
      service.uploadReceipt(actor, projectId, id, { expectedUpdatedAt: pending.updatedAt }, file),
    ).rejects.toThrow('Commit response lost')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
    expect(storage.uploadPrivateFile).toHaveBeenCalledOnce()
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })
  it('reports a receipt storage outage as unavailable without cleanup or finalization', async () => {
    storage.uploadPrivateFile.mockRejectedValue(Error('provider detail'))
    const failure = service.uploadReceipt(
      actor,
      projectId,
      id,
      { expectedUpdatedAt: pending.updatedAt },
      file,
    )
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private receipt storage unavailable')
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })
  it('removes only the allocated object when private byte verification fails before finalization', async () => {
    state.reader.mockRejectedValue(Error('Digest mismatch'))
    const failure = service.uploadReceipt(
      actor,
      projectId,
      id,
      { expectedUpdatedAt: pending.updatedAt },
      file,
    )
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private receipt storage unavailable')
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(storage.deleteFile.mock.calls[0][1]).toBe(storage.uploadPrivateFile.mock.calls[0][1])
  })
  it('preserves the object on authorization uncertainty after upload instead of privileged fallback', async () => {
    state.reader.mockImplementation(async () => {
      state.actor = { ...actor, permissions: [] }
      return bytes
    })
    await expect(
      service.uploadReceipt(actor, projectId, id, { expectedUpdatedAt: pending.updatedAt }, file),
    ).rejects.toThrow(ForbiddenException)
    expect(storage.deleteFile).not.toHaveBeenCalled()
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
  })
  it('denies other-project pending acknowledgement before any upload', async () => {
    tx.$queryRaw.mockResolvedValue([{ value: { ...pending, projectId: id } }])
    await expect(
      service.uploadReceipt(actor, projectId, id, { expectedUpdatedAt: pending.updatedAt }, file),
    ).rejects.toThrow('Pending expense changed')
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
  it('rejects content/mime mismatch before any authorized query', async () => {
    await expect(
      service.uploadReceipt(
        actor,
        projectId,
        id,
        { expectedUpdatedAt: pending.updatedAt },
        { ...file, mimetype: 'image/png' },
      ),
    ).rejects.toThrow('Receipt content')
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('keeps malformed expense and project identifiers denied before storage', async () => {
    await expect(
      service.uploadReceipt(
        actor,
        projectId,
        'bad',
        { expectedUpdatedAt: pending.updatedAt },
        file,
      ),
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.uploadReceipt(actor, 'bad', id, { expectedUpdatedAt: pending.updatedAt }, file),
    ).rejects.toThrow(NotFoundException)
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
})

describe('financial receipt reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['expenses.read', 'evidence.read'],
    }
    state.tx = tx
    state.operations = 0
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.budgetExpenseEntry.findFirst.mockResolvedValue({
      receiptEvidenceId: 'c0000000-0000-4000-8000-00000000000c',
      updatedAt: new Date('2026-09-27T00:00:00.000Z'),
    })
    tx.evidenceMedia.findFirst.mockResolvedValue({
      id: 'c0000000-0000-4000-8000-00000000000c',
      bucket: 'pathways-private',
      objectKey: `organizations/${org}/projects/a0000000-0000-4000-8000-00000000000a/evidence/c0000000-0000-4000-8000-00000000000c/receipt.pdf`,
      sha256: 'a'.repeat(64),
      byteSize: bytes.length,
      contentType: 'application/pdf',
      updatedAt: new Date('2026-09-27T00:00:01.000Z'),
    })
    tx.$queryRaw.mockResolvedValue([{ id: 'b0000000-0000-4000-8000-00000000000b' }])
    state.reader.mockResolvedValue(bytes)
    tx.auditLog.create.mockResolvedValue({})
  })
  it('accepts uppercase UUIDs through canonical private read, renewed authority and audit', async () => {
    const lowerProject = 'a0000000-0000-4000-8000-00000000000a'
    const lowerExpense = 'b0000000-0000-4000-8000-00000000000b'
    const scopedActor: ApplicationIdentity = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['expenses.read', 'evidence.read'],
      assignedProjectIds: [lowerProject],
    }
    state.actor = scopedActor
    const result = await service.receipt(
      scopedActor,
      lowerProject.toUpperCase(),
      lowerExpense.toUpperCase(),
    )
    expect(result.bytes).toBe(bytes)
    expect(tx.project.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { organizationId: org, archivedAt: null, id: { in: [lowerProject] } },
          { id: lowerProject },
        ],
      },
      select: { id: true },
    })
    expect(tx.budgetExpenseEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: org, projectId: lowerProject, id: lowerExpense },
      }),
    )
    expect(tx.evidenceMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: lowerProject, expenseId: lowerExpense }),
      }),
    )
    expect(state.reader).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: lowerProject,
        objectKey: `organizations/${org}/projects/${lowerProject}/evidence/c0000000-0000-4000-8000-00000000000c/receipt.pdf`,
      }),
    )
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toContain(lowerProject)
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toContain(lowerExpense)
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: lowerProject,
        entityId: lowerExpense,
        action: 'EXPENSE_RECEIPT_READ',
      }),
    })
    expect(state.operations).toBe(2)
  })
  it('denies malformed and foreign project requests without reading private bytes', async () => {
    await expect(service.receipt(actor, projectId, 'bad')).rejects.toThrow(NotFoundException)
    await expect(service.receipt(actor, 'bad', id)).rejects.toThrow(NotFoundException)
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.receipt(actor, 'd0000000-0000-4000-8000-00000000000d', id),
    ).rejects.toThrow(NotFoundException)
    expect(state.reader).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('reports a private read outage as unavailable without audit or bytes', async () => {
    const scopedActor: ApplicationIdentity = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['expenses.read', 'evidence.read'],
      assignedProjectIds: [projectId],
    }
    state.actor = scopedActor
    state.reader.mockRejectedValue(Error('network detail'))
    const failure = service.receipt(scopedActor, projectId, id)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private receipt storage unavailable')
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('withholds bytes when evidence permission is absent', async () => {
    state.actor = { ...actor, roles: ['PROJECT_MANAGER'], permissions: ['expenses.read'] }
    await expect(service.receipt(actor, projectId, id)).rejects.toThrow(ForbiddenException)
    expect(state.reader).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
