import 'reflect-metadata'

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
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

import { ActivitiesController } from './activities.controller'
import { RecordOverdueExplanationDto } from './activities.dto'
import { ActivitiesService } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '20000000-0000-4000-8000-00000000000f'
const clientMutationId = 'a0000000-0000-4000-8000-00000000000a'

const actor: ApplicationIdentity = {
  id: '50000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic M&E officer',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['activities.read', 'monitoring.review'],
  assignedProjectIds: [projectId],
}

function baseActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: activityId,
    projectId,
    code: 'ACT-1',
    title: 'Synthetic activity',
    description: null,
    activityType: null,
    timelineOverrideJustification: null,
    targetBeneficiaries: 25,
    plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
    plannedEndDate: new Date('2026-01-15T00:00:00.000Z'),
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
    activityOverdueExplanation_activity: [],
    ...overrides,
  }
}

const overdueActivity = baseActivity()
const notOverdueActivity = baseActivity({
  plannedEndDate: new Date('2099-01-01T00:00:00.000Z'),
})

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  projectActivityAssignment: { findFirst: vi.fn() },
  projectBudgetRecord: { findMany: vi.fn() },
  activityOverdueExplanation: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

const input = {
  clientMutationId,
  category: 'WEATHER' as const,
  explanation: 'Typhoon delayed travel to the site for two weeks.',
}

describe('Activity overdue explanation (monitoring.review)', () => {
  const service = new ActivitiesService({} as PrismaService, {} as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.$queryRaw.mockResolvedValue([])
    tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
    tx.projectActivity.findFirst.mockResolvedValue(overdueActivity)
    tx.projectActivityAssignment.findFirst.mockResolvedValue({ id: 'assignment' })
    tx.activityOverdueExplanation.findFirst.mockResolvedValue(null)
  })

  it('gates the endpoint with the monitoring.review permission', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype.recordOverdueExplanation),
    ).toBe('monitoring.review')
  })

  it('records a scoped explanation with an audit entry (happy path)', async () => {
    const result = await service.recordOverdueExplanation(actor, projectId, activityId, input)
    expect(result.id).toBe(activityId)
    expect(tx.activityOverdueExplanation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        projectId,
        activityId,
        category: 'WEATHER',
        explanation: input.explanation,
        recordedById: actor.userId,
        clientMutationId,
      }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        actorUserId: actor.userId,
        action: 'ACTIVITY_OVERDUE_EXPLANATION_RECORDED',
        entityType: 'ActivityOverdueExplanation',
      }),
    })
  })

  it('rejects when the activity is not currently overdue (409)', async () => {
    tx.projectActivity.findFirst.mockResolvedValue(notOverdueActivity)
    await expect(
      service.recordOverdueExplanation(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
  })

  it('rejects invalid category or explanation length at the DTO boundary (sad)', async () => {
    for (const body of [
      { ...input, category: 'HURRICANE' },
      { ...input, explanation: 'too short' },
      { ...input, explanation: 'x'.repeat(2001) },
      { ...input, clientMutationId: 'not-a-uuid' },
      { category: 'WEATHER', explanation: 'Valid enough explanation text here.' },
    ]) {
      const errors = await validate(plainToInstance(RecordOverdueExplanationDto, body))
      expect(errors.length).toBeGreaterThan(0)
    }
    expect(await validate(plainToInstance(RecordOverdueExplanationDto, input))).toEqual([])
  })

  it('replays the same client mutation id without a second write (idempotent)', async () => {
    tx.activityOverdueExplanation.findFirst.mockResolvedValue({
      projectId,
      activityId,
      category: 'WEATHER',
      explanation: input.explanation,
    })
    await service.recordOverdueExplanation(actor, projectId, activityId, input)
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects a reused client mutation id with different input (abuse, 409)', async () => {
    tx.activityOverdueExplanation.findFirst.mockResolvedValue({
      projectId,
      activityId,
      category: 'SECURITY',
      explanation: 'A different recorded explanation entirely.',
    })
    await expect(
      service.recordOverdueExplanation(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
  })

  it('denies an actor without the permission before any read (403)', async () => {
    state.actor = { ...actor, permissions: ['activities.read'] }
    await expect(
      service.recordOverdueExplanation(state.actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
  })

  it('succeeds for a project-assigned M&E officer with no personal activity assignment', async () => {
    // The endpoint is project-scoped, not personal-activity-scoped: an M&E officer assigned
    // to the project (actor.assignedProjectIds includes projectId) but never individually
    // assigned to this specific activity (no ProjectActivityAssignment row) still succeeds.
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    const result = await service.recordOverdueExplanation(actor, projectId, activityId, input)
    expect(result.id).toBe(activityId)
    expect(tx.activityOverdueExplanation.create).toHaveBeenCalled()
  })

  it('denies an unassigned M&E officer via uniform project-scope 404 (abuse)', async () => {
    // Matches the existing "hides a cross-organization or unassigned project" convention:
    // an M&E officer with no project assignment fails projectScope(actor) inside
    // requireProject the same way a cross-org project does, so this is 404, not 403 -
    // the endpoint never leaks whether the project/activity exists to a caller outside scope.
    tx.project.findFirst.mockResolvedValue(null)
    const unassignedActor = { ...actor, assignedProjectIds: [] }
    await expect(
      service.recordOverdueExplanation(unassignedActor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
  })

  it('per-role scope: SYSTEM_ADMINISTRATOR is org-wide, PROGRAM_MANAGER/GRANT_MANAGER need project scope', async () => {
    // The application layer never re-derives this per role: it relies entirely on
    // projectScope(actor) (via requireActivity -> requireProject), which already branches
    // SYSTEM_ADMINISTRATOR org-wide, PROGRAM_MANAGER by assignedProjectIds or managed
    // program, and every other role (GRANT_MANAGER, MONITORING_AND_EVALUATION_OFFICER,
    // PROJECT_MANAGER) by assignedProjectIds only - matching the RBAC contract's
    // monitoring.review role list and migration 0043's p05_has_project_permission check.
    for (const roles of [
      ['SYSTEM_ADMINISTRATOR'] as const,
      ['PROGRAM_MANAGER'] as const,
      ['GRANT_MANAGER'] as const,
    ]) {
      tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
      const roleActor = { ...actor, roles: [...roles], assignedProjectIds: [] }
      const result = await service.recordOverdueExplanation(roleActor, projectId, activityId, input)
      expect(result.id).toBe(activityId)
    }
  })

  it('hides a cross-organization or unassigned project before activity retrieval (abuse)', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.recordOverdueExplanation(actor, otherProjectId, activityId, input),
    ).rejects.toBeInstanceOf(NotFoundException)
    const scoped = tx.project.findFirst.mock.calls[0][0]
    expect(scoped.where.AND[0]).toMatchObject({ organizationId })
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies a cross-project activity id even inside the caller organization (abuse)', async () => {
    tx.projectActivity.findFirst.mockResolvedValue(null)
    await expect(
      service.recordOverdueExplanation(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.activityOverdueExplanation.create).not.toHaveBeenCalled()
  })

  it('reports overdueExplanationNeeded true before recording and false after (mapActivity)', async () => {
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [overdueActivity] })
    const before = await service.get(actor, projectId, activityId)
    expect(before.overdueExplanationNeeded).toBe(true)
    expect(before.overdueExplanations).toEqual([])

    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [
        baseActivity({
          activityOverdueExplanation_activity: [
            {
              id: 'exp-1',
              category: 'WEATHER',
              explanation: input.explanation,
              recordedAt: new Date('2026-09-20T00:00:00.000Z'),
              recordedBy: { fullName: actor.fullName },
            },
          ],
        }),
      ],
    })
    const after = await service.get(actor, projectId, activityId)
    expect(after.overdueExplanationNeeded).toBe(false)
    expect(after.overdueExplanations).toEqual([
      expect.objectContaining({
        id: 'exp-1',
        category: 'WEATHER',
        actorName: actor.fullName,
      }),
    ])
  })
})
