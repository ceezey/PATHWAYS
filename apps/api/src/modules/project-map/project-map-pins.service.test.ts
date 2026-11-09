import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('@app/common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

import { ProjectMapPinsService } from './project-map-pins.service'

const organizationId = '11000000-0000-4000-8000-000000000001'
const projectId = '22000000-0000-4000-8000-000000000002'
const userId = '33000000-0000-4000-8000-000000000003'
const actor: ApplicationIdentity = {
  id: '66000000-0000-4000-8000-000000000006',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic Project Manager',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read', 'projects.update'],
  assignedProjectIds: [projectId],
}

const place = { name: 'Catarman', province: 'Northern Samar' }
const rowKey = { organizationId, projectId, placeName: 'Catarman', province: 'Northern Samar' }
const move = { ...place, longitude: 124.7, latitude: 12.6, locked: false }

const tx = {
  project: { findFirst: vi.fn() },
  projectMapPin: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}

// An existing pin row at the Catarman centroid.
const stored = (locked: boolean) => ({ longitude: 124.64, latitude: 12.5, locked })

describe('ProjectMapPinsService', () => {
  const service = new ProjectMapPinsService({} as PrismaService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({
      id: projectId,
      implementationArea: 'Catarman, Northern Samar',
    })
    tx.projectMapPin.findUnique.mockResolvedValue(null)
    tx.projectMapPin.updateMany.mockResolvedValue({ count: 1 })
    tx.projectMapPin.deleteMany.mockResolvedValue({ count: 1 })
  })

  it('saves a new row for a listed place', async () => {
    await service.save(actor, projectId, move)
    expect(tx.projectMapPin.create).toHaveBeenCalledWith({
      data: { ...rowKey, longitude: 124.7, latitude: 12.6, locked: false, updatedById: userId },
    })
  })

  it('moves an unlocked row and stamps the editor', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    await service.save(actor, projectId, move)
    expect(tx.projectMapPin.create).not.toHaveBeenCalled()
    const call = tx.projectMapPin.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({
      ...rowKey,
      locked: false,
      longitude: stored(false).longitude,
      latitude: stored(false).latitude,
    })
    expect(call.data).toMatchObject({
      longitude: 124.7,
      latitude: 12.6,
      locked: false,
      updatedById: userId,
    })
    expect(call.data.updatedAt).toBeInstanceOf(Date)
  })

  it('locks a row, then rejects a move of the locked row with 409', async () => {
    tx.projectMapPin.findUnique.mockResolvedValueOnce(stored(false))
    await service.save(actor, projectId, {
      ...move,
      longitude: 124.64,
      latitude: 12.5,
      locked: true,
    })
    expect(tx.projectMapPin.updateMany.mock.calls[0][0].data.locked).toBe(true)

    tx.projectMapPin.findUnique.mockResolvedValueOnce(stored(true))
    const rejected = service.save(actor, projectId, { ...move, longitude: 124.9, locked: true })
    await expect(rejected).rejects.toThrow(ConflictException)
    await expect(rejected).rejects.toThrow('This pin is locked.')
    expect(tx.projectMapPin.updateMany).toHaveBeenCalledTimes(1)
  })

  it('unlocks a locked row when the coordinates are unchanged', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(true))
    await service.save(actor, projectId, {
      ...place,
      longitude: 124.64,
      latitude: 12.5,
      locked: false,
    })
    const call = tx.projectMapPin.updateMany.mock.calls[0][0]
    expect(call.where.locked).toBe(true)
    expect(call.data.locked).toBe(false)
  })

  it('refuses a lock with stale coordinates so it cannot undo another move', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    const rejected = service.save(actor, projectId, { ...move, locked: true })
    await expect(rejected).rejects.toThrow(ConflictException)
    await expect(rejected).rejects.toThrow('This pin changed. Try again.')
    expect(tx.projectMapPin.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses an unlock with stale coordinates and keeps the lock', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(true))
    await expect(service.save(actor, projectId, move)).rejects.toThrow(ConflictException)
    expect(tx.projectMapPin.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a lock-state change that moves an unlocked row even when only one axis differs', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    await expect(
      service.save(actor, projectId, { ...move, longitude: 124.64, locked: true }),
    ).rejects.toThrow('This pin changed. Try again.')
  })

  it('answers 409 when the row changed between the read and the write', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    tx.projectMapPin.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.save(actor, projectId, move)).rejects.toThrow(
      'This pin changed. Try again.',
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('resets an unlocked row by deleting it', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    await service.reset(actor, projectId, place)
    expect(tx.projectMapPin.deleteMany).toHaveBeenCalledWith({
      where: { ...rowKey, locked: false },
    })
  })

  it('rejects reset of a locked row with 409', async () => {
    tx.projectMapPin.findUnique.mockResolvedValue(stored(true))
    await expect(service.reset(actor, projectId, place)).rejects.toThrow(ConflictException)
    expect(tx.projectMapPin.deleteMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects a place outside the implementation area with 400', async () => {
    const outside = { ...move, name: 'Manila', province: 'Metro Manila' }
    const rejected = service.save(actor, projectId, outside)
    await expect(rejected).rejects.toThrow(BadRequestException)
    await expect(rejected).rejects.toThrow(
      "This place is not in the project's implementation area.",
    )
    await expect(
      service.reset(actor, projectId, { name: 'Manila', province: 'Metro Manila' }),
    ).rejects.toThrow(BadRequestException)
    expect(tx.projectMapPin.create).not.toHaveBeenCalled()
  })

  it('answers 404 for a project outside the actor scope', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.save(actor, projectId, move)).rejects.toThrow(NotFoundException)
  })

  it('writes one audit row per save and per reset', async () => {
    await service.save(actor, projectId, { ...move, locked: true })
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId,
      actorUserId: userId,
      projectId,
      action: 'PROJECT_MAP_PIN_SAVED',
      entityType: 'ProjectMapPin',
      entityId: projectId,
      changes: {
        name: 'Catarman',
        province: 'Northern Samar',
        longitude: 124.7,
        latitude: 12.6,
        locked: true,
      },
    })

    tx.projectMapPin.findUnique.mockResolvedValue(stored(false))
    await service.reset(actor, projectId, place)
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
    expect(tx.auditLog.create.mock.calls[1][0].data).toMatchObject({
      action: 'PROJECT_MAP_PIN_RESET',
      entityType: 'ProjectMapPin',
      entityId: projectId,
      changes: {
        name: 'Catarman',
        province: 'Northern Samar',
        longitude: 124.64,
        latitude: 12.5,
        locked: false,
      },
    })
  })
})
