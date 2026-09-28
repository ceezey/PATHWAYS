import 'reflect-metadata'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import type { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
  verify: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  ack: vi.fn(),
}))

// The operation boundary is replaced with a permission check against the synthetic actor,
// so a missing grant denies before any scoped read runs.
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, state.actor)
  }),
}))
vi.mock('@app/modules/storage/private-inspection-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/modules/storage/private-inspection-reader')>()),
  createPrivateUploadVerifier: () => state.verify,
}))
vi.mock('@app/modules/rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/modules/rules/rules-source-operation')>()),
  beginRuleSourceOperation: state.begin,
  finishRuleSourceOperation: state.finish,
  readRuleSourceAcknowledgement: state.ack,
}))

import { PrivateInspectionReadError } from '@app/modules/storage/private-inspection-reader'
import { ActivitiesController } from './activities.controller'
import { ReserveActivityProofDto } from './activities.dto'
import { ActivitiesService, activityEvidenceType, proofDeclarations } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const updateId = '40000000-0000-4000-8000-000000000004'
const evidenceId = '50000000-0000-4000-8000-000000000005'
const clientUpdateId = 'a0000000-0000-4000-8000-00000000000a'
const MiB = 1024 * 1024

const officer: ApplicationIdentity = {
  id: '70000000-0000-4000-8000-000000000007',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['activities.read', 'activities.proof.submit'],
  assignedProjectIds: [projectId],
}

const activity = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: null,
  activityType: null,
  timelineOverrideJustification: null,
  targetBeneficiaries: 25,
  plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
  plannedEndDate: new Date('2026-12-31T00:00:00.000Z'),
  actualStartDate: new Date('2026-01-01T00:00:00.000Z'),
  actualEndDate: null,
  status: 'IN_PROGRESS',
  progressPercent: 20,
  reviewedById: null,
  reviewedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  updatedAt: new Date('2026-09-13T00:00:00.000Z'),
  projectActivityAssignment_activity: [],
  activityUpdate_activity: [],
  activityJourneyStageMapping_activity: [],
  activityIndicatorLink_activity: [],
}

const sha = (seed: number) => seed.toString(16).padStart(2, '0').repeat(32)
const types = [
  ['application/pdf', 'report.pdf', 'DOCUMENT', '.pdf'],
  ['image/jpeg', 'site.jpg', 'PHOTO', '.jpg'],
  ['image/png', 'chart.png', 'PHOTO', '.png'],
  ['image/webp', 'crowd.webp', 'PHOTO', '.webp'],
  ['video/mp4', 'session.mp4', 'VIDEO', '.mp4'],
  ['video/quicktime', 'phone.MOV', 'VIDEO', '.mov'],
  ['video/webm', 'screen.webm', 'VIDEO', '.webm'],
] as const
const files = types.map(([contentType, fileName], index) => ({
  fileName,
  contentType,
  byteSize: (index + 1) * MiB,
  sha256: sha(index + 1),
}))
const reserveInput = (extra: Partial<ReserveActivityProofDto> = {}) => ({
  clientUpdateId,
  progressPercent: 60,
  note: '  Sessions held with evidence.  ',
  files,
  ...extra,
})
const keyFor = (id: string, extension: string) =>
  `organizations/${organizationId}/projects/${projectId}/evidence/${id}/proof${extension}`
const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: evidenceId,
  fileName: 'session.mp4',
  sha256: sha(5),
  contentType: 'video/mp4',
  byteSize: BigInt(40 * 1000 * 1000),
  bucket: 'pathways-private',
  objectKey: keyFor(evidenceId, '.mp4'),
  storageReady: false,
  ...overrides,
})

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn(), update: vi.fn() },
  projectActivityAssignment: { findFirst: vi.fn() },
  projectBudgetRecord: { findMany: vi.fn() },
  activityUpdate: { findFirst: vi.fn(), create: vi.fn() },
  evidenceMedia: { createMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
const storage = { createPrivateUploadUrls: vi.fn(), deleteFile: vi.fn() }
const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)
const acknowledgement = { requestId: updateId, committed: true as const, replayed: true }

beforeEach(() => {
  vi.resetAllMocks()
  state.actor = officer
  state.tx = tx as unknown as Prisma.TransactionClient
  tx.$queryRaw.mockResolvedValue([])
  tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
  tx.projectActivity.findFirst.mockResolvedValue(activity)
  tx.projectActivityAssignment.findFirst.mockResolvedValue({ id: 'assignment' })
  tx.activityUpdate.findFirst.mockResolvedValue(null)
  tx.evidenceMedia.createMany.mockResolvedValue({ count: files.length })
  tx.evidenceMedia.updateMany.mockResolvedValue({ count: 1 })
  storage.createPrivateUploadUrls.mockImplementation(async (_bucket, keys: string[]) =>
    keys.map((path) => ({ path, uploadUrl: `https://storage.invalid/upload/${path}?token=t` })),
  )
  storage.deleteFile.mockResolvedValue(true)
  state.ack.mockResolvedValue(null)
  state.finish.mockResolvedValue({ requestId: updateId, committed: true, replayed: false })
})

describe('evidence routes', () => {
  it('gate reserve, finalize and limits with the proof permission; the multipart route is retired', () => {
    for (const method of ['reserveProof', 'finalizeProofFile', 'proofUploadLimits'] as const)
      expect(Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype[method])).toBe(
        'activities.proof.submit',
      )
    const paths = Object.getOwnPropertyNames(ActivitiesController.prototype).map((name) =>
      Reflect.getMetadata(
        PATH_METADATA,
        (ActivitiesController.prototype as unknown as Record<string, object>)[name],
      ),
    )
    expect(paths).toContain(':activityId/updates/reservations')
    expect(paths).toContain(':activityId/updates/:updateId/files/:evidenceId/finalize')
    expect(paths).not.toContain(':activityId/updates')
    expect('submitUpdate' in ActivitiesController.prototype).toBe(false)
  })

  it('publishes the effective limits from configuration', () => {
    expect(service.proofUploadLimits(projectId)).toEqual({
      maxFiles: 10,
      maxFileBytes: 52_428_800,
      maxTotalBytes: 262_144_000,
      contentTypes: types.map(([type]) => type),
    })
  })
})

describe('reserve (activities.proof.submit)', () => {
  it('reserves one update and a batched evidence insert typed PHOTO/VIDEO/DOCUMENT per file', async () => {
    const result = await service.reserveProof(officer, projectId, activityId, reserveInput())
    expect(tx.activityUpdate.create).toHaveBeenCalledOnce()
    expect(tx.evidenceMedia.createMany).toHaveBeenCalledOnce()
    const rows = tx.evidenceMedia.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>
    expect(rows).toHaveLength(7)
    rows.forEach((row, index) => {
      const [contentType, fileName, type, extension] = types[index]
      expect(row).toMatchObject({
        organizationId,
        projectId,
        activityId,
        fileName,
        contentType,
        type,
        storageReady: false,
        bucket: 'pathways-private',
        byteSize: BigInt((index + 1) * MiB),
        submittedById: officer.userId,
        description: 'Sessions held with evidence.',
      })
      expect(row.objectKey).toBe(keyFor(row.id as string, extension))
    })
    // One storage client call for the whole batch, on server-derived keys only.
    expect(storage.createPrivateUploadUrls).toHaveBeenCalledOnce()
    expect(storage.createPrivateUploadUrls).toHaveBeenCalledWith(
      'pathways-private',
      rows.map((row) => row.objectKey),
    )
    expect(result).toMatchObject({ clientUpdateId, status: 'UPLOADING' })
    if (!('files' in result) || !result.files) throw new Error('Expected a reservation')
    expect(result.files.every((file) => file.uploadUrl?.includes(file.evidenceId))).toBe(true)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each(types)('types %s evidence as its media kind', (contentType, _name, type) => {
    expect(activityEvidenceType(contentType)).toBe(type)
  })

  it('rejects an eleventh file at the DTO and in the service before any read', async () => {
    const eleven = Array.from({ length: 11 }, (_, index) => ({
      ...files[0],
      sha256: sha(index + 20),
    }))
    const errors = await validate(
      plainToInstance(ReserveActivityProofDto, reserveInput({ files: eleven })),
    )
    expect(errors.map((error) => error.property)).toContain('files')
    await expect(
      service.reserveProof(officer, projectId, activityId, reserveInput({ files: eleven })),
    ).rejects.toMatchObject({ response: { code: 'PROOF_FILE_COUNT' } })
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a file over the configured limit, a total over five files and duplicates', async () => {
    expect(() => proofDeclarations([{ ...files[4], byteSize: 52_428_801 }], 52_428_800)).toThrow(
      BadRequestException,
    )
    expect(() =>
      proofDeclarations(
        Array.from({ length: 6 }, (_, index) => ({
          ...files[4],
          byteSize: 50 * MiB,
          sha256: sha(index + 40),
        })),
        50 * MiB,
      ),
    ).toThrow(/total/)
    expect(() =>
      proofDeclarations([files[0], { ...files[1], sha256: files[0].sha256 }], 50 * MiB),
    ).toThrow(/twice/)
    await expect(
      service.reserveProof(
        officer,
        projectId,
        activityId,
        reserveInput({ files: [{ ...files[4], byteSize: 52_428_801 }] }),
      ),
    ).rejects.toMatchObject({ response: { code: 'PROOF_FILE_TOO_LARGE' } })
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(storage.createPrivateUploadUrls).not.toHaveBeenCalled()
  })

  it('rejects unsupported types, names and digests at the DTO boundary', async () => {
    for (const file of [
      { ...files[0], contentType: 'text/html' },
      { ...files[0], contentType: 'image/gif' },
      { ...files[0], fileName: '../escape.pdf' },
      { ...files[0], fileName: 'a\\b.pdf' },
      { ...files[0], sha256: 'F'.repeat(64) },
      { ...files[0], byteSize: 0 },
      { ...files[0], byteSize: 104_857_601 },
      { ...files[0], unexpected: true },
    ]) {
      const errors = await validate(
        plainToInstance(ReserveActivityProofDto, reserveInput({ files: [file as never] })),
        { whitelist: true, forbidNonWhitelisted: true },
      )
      expect(errors.length).toBeGreaterThan(0)
    }
    expect(await validate(plainToInstance(ReserveActivityProofDto, reserveInput()))).toEqual([])
  })

  it('an identical retry returns the same reservation with fresh URLs for unverified files only', async () => {
    const verified = storedRow({
      id: '50000000-0000-4000-8000-00000000000a',
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      sha256: sha(9),
      objectKey: keyFor('50000000-0000-4000-8000-00000000000a', '.pdf'),
      storageReady: true,
    })
    const pending = storedRow()
    tx.activityUpdate.findFirst.mockResolvedValue({
      id: updateId,
      projectId,
      activityId,
      progressPercent: 60,
      note: 'Sessions held with evidence.',
      status: 'PENDING',
      evidenceMedia_update: [verified, pending],
    })
    const result = await service.reserveProof(
      officer,
      projectId,
      activityId,
      reserveInput({
        files: [verified, pending].map((row) => ({
          fileName: row.fileName as string,
          contentType: row.contentType as 'video/mp4',
          byteSize: Number(row.byteSize),
          sha256: row.sha256 as string,
        })),
      }),
    )
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.createMany).not.toHaveBeenCalled()
    expect(storage.createPrivateUploadUrls).toHaveBeenCalledWith('pathways-private', [
      pending.objectKey,
    ])
    if (!('files' in result) || !result.files) throw new Error('Expected a reservation')
    expect(result.files.map((file) => [file.storageReady, Boolean(file.uploadUrl)])).toEqual([
      [true, false],
      [false, true],
    ])
  })

  it('a retry with changed declarations conflicts before any storage call', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({
      id: updateId,
      projectId,
      activityId,
      progressPercent: 60,
      note: 'Sessions held with evidence.',
      status: 'PENDING',
      evidenceMedia_update: [storedRow()],
    })
    await expect(
      service.reserveProof(officer, projectId, activityId, reserveInput()),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(state.ack).not.toHaveBeenCalled()
    expect(storage.createPrivateUploadUrls).not.toHaveBeenCalled()
  })

  it.each([
    ['PROJECT_MANAGER', ['activities.read', 'activities.update', 'evidence.read']],
    ['MONITORING_AND_EVALUATION_OFFICER', ['activities.read', 'evidence.read', 'evidence.review']],
  ])('denies %s without proof authority before any read', async (role, permissions) => {
    state.actor = { ...officer, roles: [role], permissions }
    await expect(
      service.reserveProof(state.actor, projectId, activityId, reserveInput()),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(storage.createPrivateUploadUrls).not.toHaveBeenCalled()
  })

  it('denies a non-assigned officer before reading or writing any update', async () => {
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(
      service.reserveProof(officer, projectId, activityId, reserveInput()),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.projectActivityAssignment.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId,
      projectId,
      activityId,
      projectAssignment: { userId: officer.userId, status: 'ACTIVE' },
    })
    expect(tx.activityUpdate.findFirst).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.createMany).not.toHaveBeenCalled()
  })

  it('hides a cross-project or cross-organization activity before activity retrieval', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.reserveProof(
        officer,
        '20000000-0000-4000-8000-00000000000f',
        activityId,
        reserveInput(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.project.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({ organizationId })
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(storage.createPrivateUploadUrls).not.toHaveBeenCalled()
  })

  it('fails closed without tokens when signing fails', async () => {
    storage.createPrivateUploadUrls.mockRejectedValue(new Error('provider detail'))
    await expect(
      service.reserveProof(officer, projectId, activityId, reserveInput()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

describe('per-file finalize', () => {
  const finalize = (id = evidenceId) =>
    service.finalizeProofFile(officer, projectId, activityId, updateId, id)
  const target = (overrides: Record<string, unknown> = {}) => ({
    ...storedRow(overrides),
    activityUpdate: { status: 'PENDING' },
  })
  const update = (rows: Array<Record<string, unknown>>) => ({
    id: updateId,
    clientUpdateId,
    status: 'PENDING',
    progressPercent: 60,
    note: 'Sessions held with evidence.',
    evidenceMedia_update: rows,
  })

  beforeEach(() => {
    tx.evidenceMedia.findFirst.mockResolvedValue(target())
    tx.activityUpdate.findFirst.mockResolvedValue(update([storedRow()]))
    state.verify.mockResolvedValue('VERIFIED')
    state.begin.mockResolvedValue({
      kind: 'NEW',
      operationHandle: '90000000-0000-4000-8000-000000000009',
      reservedRecordId: null,
      generatedValues: {
        timestamp: '2026-09-28T00:00:00.000Z',
        businessDate: '2026-09-28',
        normalizedValue: null,
        requestHash: null,
      },
    })
  })

  it('verifies the exact server-derived object, marks it ready and commits the last file for review', async () => {
    const result = await finalize()
    expect(state.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        evidenceId,
        bucket: 'pathways-private',
        objectKey: keyFor(evidenceId, '.mp4'),
        expectedBytes: 40_000_000,
        expectedSha256: sha(5),
        contentType: 'video/mp4',
      }),
    )
    expect(tx.evidenceMedia.findFirst.mock.calls[0][0].where).toMatchObject({
      id: evidenceId,
      organizationId,
      projectId,
      activityId,
      activityUpdateId: updateId,
      submittedById: officer.userId,
    })
    expect(tx.evidenceMedia.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: evidenceId, storageReady: false, organizationId }),
      data: { storageReady: true },
    })
    expect(state.begin.mock.calls[0][5]).toMatchObject({
      updateId,
      progressPercent: 60,
      files: [{ fileName: 'session.mp4', contentType: 'video/mp4', byteSize: 40_000_000 }],
    })
    expect(tx.projectActivity.update).toHaveBeenCalledWith({
      where: { id: activityId },
      data: expect.objectContaining({ status: 'FOR_REVIEW', progressPercent: 60 }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACTIVITY_UPDATE_SUBMITTED',
        changes: { progressPercent: 60, proofCount: 1 },
      }),
    })
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toMatch(/token|objectKey|sha256/)
    expect(result).toMatchObject({
      status: 'COMMITTED',
      activity: { id: activityId, sourceAcknowledgement: { requestId: clientUpdateId } },
    })
  })

  it('reports remaining files without committing while siblings are unverified', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue(
      update([storedRow(), storedRow({ id: '50000000-0000-4000-8000-00000000000b' })]),
    )
    expect(await finalize()).toEqual({ status: 'UPLOADING', updateId, remaining: 1 })
    expect(state.begin).not.toHaveBeenCalled()
  })

  it.each([
    ['TYPE_MISMATCH', 'PROOF_TYPE_MISMATCH', true],
    ['SIZE_MISMATCH', 'PROOF_SIZE_MISMATCH', true],
    ['DIGEST_MISMATCH', 'PROOF_DIGEST_MISMATCH', true],
    ['OBJECT_MISSING', 'PROOF_OBJECT_MISSING', false],
  ])('rejects %s with 422 %s and leaves the row unready', async (verdict, code, deletes) => {
    state.verify.mockResolvedValue(verdict)
    const error = await finalize().catch((value) => value)
    expect(error).toBeInstanceOf(UnprocessableEntityException)
    expect(error.getResponse()).toMatchObject({ statusCode: 422, code })
    expect(storage.deleteFile).toHaveBeenCalledTimes(deletes ? 1 : 0)
    if (deletes)
      expect(storage.deleteFile).toHaveBeenCalledWith(
        'pathways-private',
        keyFor(evidenceId, '.mp4'),
      )
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
    expect(state.begin).not.toHaveBeenCalled()
  })

  it('a spoofed type (declared MP4, uploaded HTML) is rejected through the verifier', async () => {
    state.verify.mockResolvedValue('TYPE_MISMATCH')
    await expect(finalize()).rejects.toMatchObject({ response: { code: 'PROOF_TYPE_MISMATCH' } })
  })

  it('an upload made with a token for another key never satisfies this row', async () => {
    // The object for this row was never written at its own key; finalize reads only that key.
    state.verify.mockImplementation(async (input: { objectKey: string }) =>
      input.objectKey === keyFor(evidenceId, '.mp4') ? 'OBJECT_MISSING' : 'VERIFIED',
    )
    await expect(finalize()).rejects.toMatchObject({ response: { code: 'PROOF_OBJECT_MISSING' } })
  })

  it('treats storage failure as 503 without deleting or marking', async () => {
    state.verify.mockRejectedValue(new PrivateInspectionReadError())
    await expect(finalize()).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.deleteFile).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a stored size above the current configured limit before storage', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(target({ byteSize: BigInt(52_428_801) }))
    await expect(finalize()).rejects.toMatchObject({ response: { code: 'PROOF_FILE_TOO_LARGE' } })
    expect(state.verify).not.toHaveBeenCalled()
  })

  it('is idempotent: a verified file is not re-read and a committed update replays its receipt', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(target({ storageReady: true }))
    tx.activityUpdate.findFirst.mockResolvedValue(update([storedRow({ storageReady: true })]))
    state.begin.mockResolvedValue({ kind: 'REPLAY', acknowledgement })
    expect(await finalize()).toEqual({
      status: 'COMMITTED',
      acknowledgement: { ...acknowledgement, requestId: clientUpdateId },
    })
    expect(state.verify).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.update).not.toHaveBeenCalled()
  })

  it('denies a non-assigned officer before any evidence read or storage', async () => {
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(finalize()).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
    expect(state.verify).not.toHaveBeenCalled()
  })

  it('denies an M&E officer or Project Manager without proof authority before any read', async () => {
    state.actor = {
      ...officer,
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: ['evidence.read', 'evidence.review'],
    }
    await expect(
      service.finalizeProofFile(state.actor, projectId, activityId, updateId, evidenceId),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(state.verify).not.toHaveBeenCalled()
  })

  it('hides cross-organization, cross-project and foreign-submitter evidence before storage', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(finalize()).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    tx.evidenceMedia.findFirst.mockResolvedValue(null)
    await expect(finalize()).rejects.toBeInstanceOf(NotFoundException)
    expect(state.verify).not.toHaveBeenCalled()
    await expect(
      service.finalizeProofFile(officer, projectId, activityId, updateId, 'not-a-uuid'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
