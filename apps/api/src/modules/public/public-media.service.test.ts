import 'reflect-metadata'

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'

const state = vi.hoisted(() => ({ actor: undefined as ApplicationIdentity | undefined }))
const reader = vi.hoisted(() => ({ verify: vi.fn(), release: vi.fn() }))
const tx = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  evidenceMedia: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}))

// The operation boundary is replaced with a permission check against the synthetic actor.
vi.mock('@app/common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(tx, state.actor)
  }),
}))

import { PublicMediaService } from './public-media.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const mediaId = '50000000-0000-4000-8000-000000000005'
const uploaderId = '80000000-0000-4000-8000-000000000008'
const senderId = '80000000-0000-4000-8000-000000000009'
const reviewerId = '80000000-0000-4000-8000-000000000010'

const identity = (userId: string, permissions: string[]): ApplicationIdentity => ({
  id: '70000000-0000-4000-8000-000000000007',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: ['PROJECT_MANAGER'],
  permissions,
  assignedProjectIds: [projectId],
})
const uploader = identity(uploaderId, ['public.preview', 'evidence.read'])
const reviewer = identity(reviewerId, ['public.preview', 'public.approve', 'evidence.read'])

const storage = { createPrivateUploadUrls: vi.fn(), deleteFile: vi.fn() }
const storageFactories = {
  createPrivateUploadVerifier: () => reader.verify,
  createPrivateObjectStreamer: () => ({ release: reader.release }),
} as unknown as PrivateStorageFactories
const service = new PublicMediaService(
  {} as PrismaService,
  storage as unknown as StorageService,
  storageFactories,
)

const sha = 'a'.repeat(64)
const file = {
  fileName: 'visit.jpg',
  contentType: 'image/jpeg' as const,
  byteSize: 1000,
  sha256: sha,
}
const row = (overrides = {}) => ({
  id: mediaId,
  bucket: 'pathways-private',
  objectKey: 'k',
  byteSize: 1000n,
  sha256: sha,
  contentType: 'image/jpeg',
  type: 'PHOTO',
  status: 'PENDING',
  storageReady: false,
  activityId: null,
  expenseId: null,
  sourceSubmissionId: null,
  enrollmentId: null,
  submittedById: uploaderId,
  publicVisibilityStatus: 'PRIVATE',
  publicSubmittedById: null,
  ...overrides,
})
const queued = (overrides = {}) =>
  row({
    storageReady: true,
    publicVisibilityStatus: 'FOR_REVIEW',
    publicSubmittedById: senderId,
    ...overrides,
  })

beforeEach(() => {
  vi.resetAllMocks()
  state.actor = uploader
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.evidenceMedia.findFirst.mockResolvedValue(row())
  tx.evidenceMedia.updateMany.mockResolvedValue({ count: 1 })
})

describe('public media upload', () => {
  it('reserve creates unlinked rows', async () => {
    storage.createPrivateUploadUrls.mockImplementation(async (_bucket, paths: string[]) =>
      paths.map((path) => ({ path, uploadUrl: `https://upload/${path}` })),
    )
    const result = await service.reserve(uploader, projectId, { files: [file] })
    const data = tx.evidenceMedia.createMany.mock.calls[0][0].data[0]
    expect(data).toMatchObject({
      organizationId,
      projectId,
      type: 'PHOTO',
      storageReady: false,
      submittedById: uploaderId,
    })
    for (const link of ['activityId', 'expenseId', 'enrollmentId', 'sourceSubmissionId'])
      expect(data).not.toHaveProperty(link)
    expect(data.objectKey).toBe(
      `organizations/${organizationId}/projects/${projectId}/evidence/${data.id}/proof.jpg`,
    )
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'PUBLIC_MEDIA_RESERVED',
      projectId,
    })
    expect(result.files[0]).toMatchObject({ mediaId: data.id, uploadUrl: expect.any(String) })
  })

  it('reserve rejects a pdf before any database work', async () => {
    await expect(
      service.reserve(uploader, projectId, {
        files: [{ ...file, contentType: 'application/pdf' }],
      } as never),
    ).rejects.toMatchObject({ status: 400 })
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('reports the upload limits', () => {
    expect(service.limits()).toMatchObject({ maxFiles: 10, contentTypes: expect.any(Array) })
    expect(service.limits().contentTypes).not.toContain('application/pdf')
  })

  it('finalize verifies then queues', async () => {
    reader.verify.mockResolvedValue('VERIFIED')
    const result = await service.finalize(uploader, projectId, mediaId)
    expect(result).toEqual({ mediaId, publicStatus: 'FOR_REVIEW' })
    expect(tx.evidenceMedia.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: mediaId, submittedById: uploaderId, storageReady: false },
      data: {
        storageReady: true,
        publicVisibilityStatus: 'FOR_REVIEW',
        publicSubmittedById: uploaderId,
        publicSubmittedAt: expect.any(Date),
      },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'PUBLIC_MEDIA_SUBMITTED',
      entityId: mediaId,
    })
  })

  it('finalize reads only the uploader unlinked rows', async () => {
    reader.verify.mockResolvedValue('VERIFIED')
    await service.finalize(uploader, projectId, mediaId)
    expect(tx.evidenceMedia.findFirst.mock.calls[0][0].where).toMatchObject({
      submittedById: uploaderId,
      activityId: null,
      expenseId: null,
      sourceSubmissionId: null,
      enrollmentId: null,
    })
  })

  it('finalize answers a mismatch with 422 and deletes the object', async () => {
    reader.verify.mockResolvedValue('DIGEST_MISMATCH')
    storage.deleteFile.mockResolvedValue(undefined)
    await expect(service.finalize(uploader, projectId, mediaId)).rejects.toMatchObject({
      status: 422,
      response: { code: 'PROOF_DIGEST_MISMATCH' },
    })
    expect(storage.deleteFile).toHaveBeenCalledWith('pathways-private', 'k')
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('finalize keeps a missing object for a retry', async () => {
    reader.verify.mockResolvedValue('OBJECT_MISSING')
    await expect(service.finalize(uploader, projectId, mediaId)).rejects.toMatchObject({
      status: 422,
      response: { code: 'PROOF_OBJECT_MISSING' },
    })
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })

  it('finalize returns an already queued row without verifying again', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(queued({ publicSubmittedById: uploaderId }))
    await expect(service.finalize(uploader, projectId, mediaId)).resolves.toEqual({
      mediaId,
      publicStatus: 'FOR_REVIEW',
    })
    expect(reader.verify).not.toHaveBeenCalled()
  })
})

describe('public media queue', () => {
  it('submit sends ready beneficiary media to the queue', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(row({ enrollmentId: 'e1', storageReady: true }))
    await expect(service.submit(uploader, projectId, mediaId)).resolves.toEqual({
      mediaId,
      publicStatus: 'FOR_REVIEW',
    })
    expect(tx.evidenceMedia.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: mediaId, publicVisibilityStatus: 'PRIVATE' },
      data: {
        publicVisibilityStatus: 'FOR_REVIEW',
        publicSubmittedById: uploaderId,
        publicSubmittedAt: expect.any(Date),
      },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('PUBLIC_MEDIA_SUBMITTED')
  })

  it.each([
    ['an activity link', { activityId: 'a1', enrollmentId: null, storageReady: true }],
    ['an upload', { enrollmentId: null, storageReady: true }],
    ['an unready file', { enrollmentId: 'e1', storageReady: false }],
    ['a rejected file', { enrollmentId: 'e1', storageReady: true, status: 'REJECTED' }],
    [
      'a queued file',
      { enrollmentId: 'e1', storageReady: true, publicVisibilityStatus: 'FOR_REVIEW' },
    ],
  ])('submit only beneficiary media: %s gives 409', async (_name, overrides) => {
    tx.evidenceMedia.findFirst.mockResolvedValue(row(overrides))
    await expect(service.submit(uploader, projectId, mediaId)).rejects.toMatchObject({
      status: 409,
    })
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('approve records the reviewer', async () => {
    state.actor = reviewer
    tx.evidenceMedia.findFirst.mockResolvedValue(queued())
    await expect(service.approve(reviewer, projectId, mediaId)).resolves.toEqual({
      mediaId,
      publicStatus: 'APPROVED',
    })
    expect(tx.evidenceMedia.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: mediaId, publicVisibilityStatus: 'FOR_REVIEW' },
      data: {
        publicVisibilityStatus: 'APPROVED',
        publicApprovedById: reviewerId,
        publicApprovedAt: expect.any(Date),
      },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('PUBLIC_MEDIA_APPROVED')
  })

  it('approve refuses the uploader and the queue submitter', async () => {
    for (const userId of [uploaderId, senderId]) {
      state.actor = identity(userId, ['public.approve'])
      tx.evidenceMedia.findFirst.mockResolvedValue(queued())
      await expect(service.approve(state.actor, projectId, mediaId)).rejects.toThrow(
        'A different reviewer must approve this media.',
      )
    }
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['a private file', { publicVisibilityStatus: 'PRIVATE' }],
    ['an approved file', { publicVisibilityStatus: 'APPROVED' }],
    ['a rejected file', { status: 'REJECTED' }],
  ])('approve gives 409 for %s', async (_name, overrides) => {
    state.actor = reviewer
    tx.evidenceMedia.findFirst.mockResolvedValue(queued(overrides))
    await expect(service.approve(reviewer, projectId, mediaId)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('reject requires a reason', async () => {
    state.actor = reviewer
    for (const input of [
      {},
      { reason: '   ' },
      { reason: 'r'.repeat(2001) },
      { reason: 'x', extra: 1 },
    ])
      await expect(
        service.reject(reviewer, projectId, mediaId, input as never),
      ).rejects.toMatchObject({ status: 400 })
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('reject keeps the row in review with the reason and the reviewer', async () => {
    state.actor = reviewer
    tx.evidenceMedia.findFirst.mockResolvedValue(queued())
    await expect(
      service.reject(reviewer, projectId, mediaId, { reason: ' Faces are visible ' }),
    ).resolves.toEqual({ mediaId, status: 'REJECTED' })
    const call = tx.evidenceMedia.updateMany.mock.calls[0][0]
    expect(call.data).toEqual({
      status: 'REJECTED',
      rejectedById: reviewerId,
      rejectedAt: expect.any(Date),
      rejectionReason: 'Faces are visible',
    })
    expect(call.data).not.toHaveProperty('publicVisibilityStatus')
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('PUBLIC_MEDIA_REJECTED')
  })

  it('reject refuses the uploader and a private or already rejected file', async () => {
    state.actor = identity(uploaderId, ['public.approve'])
    tx.evidenceMedia.findFirst.mockResolvedValue(queued())
    await expect(service.reject(state.actor, projectId, mediaId, { reason: 'No' })).rejects.toThrow(
      'A different reviewer must reject this media.',
    )
    state.actor = reviewer
    for (const overrides of [{ publicVisibilityStatus: 'PRIVATE' }, { status: 'REJECTED' }]) {
      tx.evidenceMedia.findFirst.mockResolvedValue(queued(overrides))
      await expect(
        service.reject(reviewer, projectId, mediaId, { reason: 'No' }),
      ).rejects.toMatchObject({ status: 409 })
    }
    expect(tx.evidenceMedia.updateMany).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown media id or project', async () => {
    state.actor = reviewer
    await expect(service.approve(reviewer, projectId, 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    tx.evidenceMedia.findFirst.mockResolvedValue(null)
    await expect(service.approve(reviewer, projectId, mediaId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.approve(reviewer, projectId, mediaId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('public media list and content', () => {
  const listed = (overrides = {}) => ({
    id: mediaId,
    type: 'PHOTO',
    contentType: 'image/jpeg',
    fileName: 'a.jpg',
    status: 'PENDING',
    publicVisibilityStatus: 'PRIVATE',
    submittedById: uploaderId,
    publicSubmittedById: null,
    rejectionReason: null,
    storageReady: true,
    activityId: null,
    activityUpdateId: null,
    enrollmentId: null,
    ...overrides,
  })
  const proof = { activityId: 'a', activityUpdateId: 'u' }

  it('list marks pickable per the rule', async () => {
    tx.evidenceMedia.findMany.mockResolvedValue([
      listed({ id: 'proof-ok', ...proof, status: 'VERIFIED' }),
      listed({ id: 'proof-approved', ...proof, status: 'APPROVED' }),
      listed({ id: 'proof-pending', ...proof }),
      listed({ id: 'proof-rejected', ...proof, status: 'REJECTED' }),
      listed({ id: 'queue-ok', publicVisibilityStatus: 'APPROVED' }),
      listed({ id: 'queue-review', publicVisibilityStatus: 'FOR_REVIEW' }),
      listed({ id: 'queue-rejected', publicVisibilityStatus: 'APPROVED', status: 'REJECTED' }),
      listed({ id: 'queue-unready', publicVisibilityStatus: 'APPROVED', storageReady: false }),
      listed({
        id: 'queue-pdf',
        publicVisibilityStatus: 'APPROVED',
        contentType: 'application/pdf',
      }),
      listed({ id: 'video-as-photo', type: 'VIDEO', publicVisibilityStatus: 'APPROVED' }),
      listed({ id: 'private-upload' }),
    ])
    const { items } = await service.list(uploader, projectId)
    expect(Object.fromEntries(items.map((item) => [item.id, item.pickable]))).toEqual({
      'proof-ok': true,
      'proof-approved': true,
      'proof-pending': false,
      'proof-rejected': false,
      'queue-ok': true,
      'queue-review': false,
      'queue-rejected': false,
      'queue-unready': false,
      'queue-pdf': false,
      'video-as-photo': false,
      'private-upload': false,
    })
  })

  it('list names the source of each row', async () => {
    tx.evidenceMedia.findMany.mockResolvedValue([
      listed({ id: 'a', ...proof }),
      listed({ id: 'b', enrollmentId: 'e' }),
      listed({ id: 'c' }),
    ])
    const { items } = await service.list(uploader, projectId)
    expect(items.map((item) => item.source)).toEqual(['ACTIVITY', 'BENEFICIARY', 'UPLOAD'])
    expect(tx.evidenceMedia.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId,
      projectId,
      storageReady: true,
      expenseId: null,
      sourceSubmissionId: null,
    })
    expect(tx.evidenceMedia.findMany.mock.calls[0][0].take).toBe(500)
  })

  it('list and content need evidence.read as well as public.preview', async () => {
    state.actor = identity(uploaderId, ['public.preview'])
    await expect(service.list(state.actor, projectId)).rejects.toThrow(
      'Evidence access is required to view media.',
    )
    await expect(service.content(state.actor, projectId, mediaId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    state.actor = identity(uploaderId, ['evidence.read'])
    await expect(service.list(state.actor, projectId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.findMany).not.toHaveBeenCalled()
  })

  it('content streams a ready listed file through the verified streamer', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(row({ storageReady: true }))
    reader.release.mockResolvedValue('stream')
    await expect(service.content(uploader, projectId, mediaId)).resolves.toEqual({
      body: 'stream',
      byteSize: 1000,
      contentType: 'image/jpeg',
    })
    expect(tx.evidenceMedia.findFirst.mock.calls[0][0].where).toMatchObject({
      storageReady: true,
      expenseId: null,
      sourceSubmissionId: null,
    })
  })

  it('content answers 503 when the stream cannot start', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValue(row({ storageReady: true }))
    reader.release.mockRejectedValue(new Error('down'))
    await expect(service.content(uploader, projectId, mediaId)).rejects.toMatchObject({
      status: 503,
    })
  })
})
