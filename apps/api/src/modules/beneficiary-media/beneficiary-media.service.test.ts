import 'reflect-metadata'

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({ actor: undefined as ApplicationIdentity | undefined }))
const reader = vi.hoisted(() => ({ verify: vi.fn(), release: vi.fn() }))
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
  evidenceMedia: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}))

// The operation boundary is replaced with a permission check against the synthetic actor.
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(tx, state.actor)
  }),
}))
vi.mock('@app/modules/storage/private-inspection-reader', () => ({
  createPrivateUploadVerifier: () => reader.verify,
  createPrivateObjectStreamer: () => ({ release: reader.release }),
}))

import { BeneficiaryMediaService } from './beneficiary-media.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const beneficiaryId = '30000000-0000-4000-8000-000000000003'
const enrollmentId = '40000000-0000-4000-8000-000000000004'
const mediaId = '50000000-0000-4000-8000-000000000005'
const userId = '80000000-0000-4000-8000-000000000008'

const identity = (roles: string[], permissions: string[]): ApplicationIdentity => ({
  id: '70000000-0000-4000-8000-000000000007',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles,
  permissions,
  assignedProjectIds: [projectId],
})
const officer = identity(
  ['PROJECT_OFFICER'],
  ['beneficiaries.records.read', 'beneficiaries.enrollments.manage'],
)
const storage = {
  createPrivateUploadUrls: vi.fn(),
  deleteFile: vi.fn(),
}
const service = new BeneficiaryMediaService(
  {} as PrismaService,
  storage as unknown as StorageService,
)

const sha = 'a'.repeat(64)
const file = {
  fileName: 'visit.jpg',
  contentType: 'image/jpeg' as const,
  byteSize: 1000,
  sha256: sha,
}
const reserved = (overrides = {}) => ({
  id: mediaId,
  bucket: 'pathways-private',
  objectKey: 'k',
  byteSize: 1000n,
  sha256: sha,
  contentType: 'image/jpeg',
  storageReady: false,
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  state.actor = officer
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({ id: enrollmentId })
  tx.evidenceMedia.findFirst.mockResolvedValue(reserved())
  tx.evidenceMedia.updateMany.mockResolvedValue({ count: 1 })
})

const noScopedRead = () => {
  expect(tx.project.findFirst).not.toHaveBeenCalled()
  expect(tx.evidenceMedia.findMany).not.toHaveBeenCalled()
  expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
  expect(tx.evidenceMedia.createMany).not.toHaveBeenCalled()
}

describe('beneficiary media access', () => {
  it('denies a missing permission before any scoped read', async () => {
    state.actor = identity(['PROJECT_OFFICER'], [])
    await expect(service.list(state.actor, projectId, beneficiaryId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      service.reserve(state.actor, projectId, beneficiaryId, { files: [file] }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    noScopedRead()
  })

  it('denies aggregate-only roles on every operation before any scoped read', async () => {
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER']) {
      state.actor = identity([role], officer.permissions)
      await expect(service.list(state.actor, projectId, beneficiaryId)).rejects.toThrow(
        'Aggregate access only.',
      )
      await expect(service.content(state.actor, projectId, beneficiaryId, mediaId)).rejects.toThrow(
        'Aggregate access only.',
      )
      await expect(
        service.reserve(state.actor, projectId, beneficiaryId, { files: [file] }),
      ).rejects.toThrow('Aggregate access only.')
      await expect(
        service.finalize(state.actor, projectId, beneficiaryId, mediaId),
      ).rejects.toThrow('Aggregate access only.')
    }
    noScopedRead()
    expect(reader.release).not.toHaveBeenCalled()
  })

  it('denies an unassigned or foreign project before any media read', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.list(officer, projectId, beneficiaryId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(
      service.content(officer, projectId, beneficiaryId, mediaId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.findMany).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
  })

  it('lists only ready rows of the resolved enrollment', async () => {
    tx.evidenceMedia.findMany.mockResolvedValue([
      {
        id: mediaId,
        type: 'PHOTO',
        fileName: 'visit.jpg',
        contentType: 'image/jpeg',
        byteSize: 1000n,
        description: 'Home visit',
        submittedAt: new Date('2026-10-01T00:00:00.000Z'),
        storageReady: true,
        submittedBy: { fullName: 'Synthetic actor' },
      },
    ])
    const items = await service.list(officer, projectId, beneficiaryId)
    expect(tx.evidenceMedia.findMany.mock.calls[0][0].where).toEqual({
      organizationId,
      projectId,
      enrollmentId,
      storageReady: true,
    })
    expect(items[0]).toMatchObject({ id: mediaId, byteSize: 1000, submittedBy: 'Synthetic actor' })
  })
})

describe('beneficiary media reservation', () => {
  it.each([
    ['no files', []],
    [
      'eleven files',
      Array.from({ length: 11 }, (_, i) => ({ ...file, sha256: String(i).padEnd(64, '0') })),
    ],
    ['a pdf', [{ ...file, contentType: 'application/pdf' }]],
    ['a bad digest', [{ ...file, sha256: 'xyz' }]],
    ['an oversize file', [{ ...file, byteSize: 10 ** 9 }]],
    ['a duplicate digest', [file, { ...file, fileName: 'again.jpg' }]],
  ])('rejects %s before any database work', async (_name, files) => {
    await expect(
      service.reserve(officer, projectId, beneficiaryId, { files } as never),
    ).rejects.toMatchObject({ status: 400 })
    noScopedRead()
  })

  it('creates unready rows bound to the enrollment with the derived object key', async () => {
    storage.createPrivateUploadUrls.mockImplementation(async (_bucket, paths: string[]) =>
      paths.map((path) => ({ path, uploadUrl: `https://upload/${path}` })),
    )
    const result = await service.reserve(officer, projectId, beneficiaryId, {
      files: [
        file,
        {
          ...file,
          fileName: 'clip.mp4',
          contentType: 'video/mp4' as const,
          sha256: 'b'.repeat(64),
        },
      ],
      note: ' Field visit ',
    })
    const rows = tx.evidenceMedia.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      organizationId,
      projectId,
      enrollmentId,
      type: 'PHOTO',
      storageReady: false,
      description: 'Field visit',
      submittedById: userId,
    })
    expect(rows[1].type).toBe('VIDEO')
    expect(rows[0].objectKey).toBe(
      `organizations/${organizationId}/projects/${projectId}/evidence/${rows[0].id}/proof.jpg`,
    )
    expect(rows[0]).not.toHaveProperty('activityId')
    expect(rows[0]).not.toHaveProperty('status')
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'BENEFICIARY_MEDIA_RESERVED',
    })
    expect(result.files.map((entry) => entry.mediaId)).toEqual(
      rows.map((row: { id: string }) => row.id),
    )
    expect(result.files[0].uploadUrl).toContain(rows[0].objectKey)
  })
})

describe('beneficiary media finalize', () => {
  it('marks the row ready only after a verified inspection', async () => {
    reader.verify.mockResolvedValue('VERIFIED')
    await expect(service.finalize(officer, projectId, beneficiaryId, mediaId)).resolves.toEqual({
      mediaId,
      storageReady: true,
    })
    expect(tx.evidenceMedia.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: mediaId, organizationId, projectId, enrollmentId, storageReady: false },
      data: { storageReady: true },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('BENEFICIARY_MEDIA_FINALIZED')
  })

  it('rejects a mismatch with 422, deletes the object and never marks ready', async () => {
    reader.verify.mockResolvedValue('DIGEST_MISMATCH')
    storage.deleteFile.mockResolvedValue(true)
    await expect(
      service.finalize(officer, projectId, beneficiaryId, mediaId),
    ).rejects.toMatchObject({
      status: 422,
    })
    expect(storage.deleteFile).toHaveBeenCalledWith('pathways-private', 'k')
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('keeps a missing object retryable without deleting anything', async () => {
    reader.verify.mockResolvedValue('OBJECT_MISSING')
    await expect(
      service.finalize(officer, projectId, beneficiaryId, mediaId),
    ).rejects.toMatchObject({
      status: 422,
    })
    expect(storage.deleteFile).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('is idempotent for an already ready row', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(reserved({ storageReady: true }))
    await expect(service.finalize(officer, projectId, beneficiaryId, mediaId)).resolves.toEqual({
      mediaId,
      storageReady: true,
    })
    expect(reader.verify).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('only finalizes rows submitted by the actor', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(null)
    await expect(
      service.finalize(officer, projectId, beneficiaryId, mediaId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.evidenceMedia.findFirst.mock.calls[0][0].where).toMatchObject({
      submittedById: userId,
      enrollmentId,
    })
  })
})

describe('beneficiary media content', () => {
  it('streams a ready row scoped by organization, project and enrollment', async () => {
    reader.release.mockResolvedValue('stream')
    const result = await service.content(officer, projectId, beneficiaryId, mediaId)
    expect(tx.evidenceMedia.findFirst.mock.calls[0][0].where).toEqual({
      storageReady: true,
      organizationId,
      projectId,
      enrollmentId,
      id: mediaId,
    })
    expect(result).toMatchObject({ body: 'stream', byteSize: 1000, contentType: 'image/jpeg' })
  })
})
