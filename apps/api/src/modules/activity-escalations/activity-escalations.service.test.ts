import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { activityEscalationResponse, rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityEscalationsService } from './activity-escalations.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const org = '10000000-0000-4000-8000-00000000000a'
const project = '20000000-0000-4000-8000-00000000000a'
const activityId = '40000000-0000-4000-8000-00000000000a'
const escalationId = '50000000-0000-4000-8000-00000000000a'
const mutation = '60000000-0000-4000-8000-00000000000a'
const officer = '30000000-0000-4000-8000-000000000001'
const manager = '30000000-0000-4000-8000-000000000002'
const otherManager = '30000000-0000-4000-8000-000000000003'
const programManager = '30000000-0000-4000-8000-000000000004'
const stamp = new Date('2026-10-19T01:00:00.000Z')

function actor(role: keyof typeof rolePermissions, userId: string) {
  return {
    id: userId,
    aal: 'aal2',
    userId,
    organizationId: org,
    fullName: 'Synthetic fixture',
    roles: [role],
    permissions: [...rolePermissions[role]],
    assignedProjectIds: [project],
  } as ApplicationIdentity
}

function escalationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: escalationId,
    projectId: project,
    activityId,
    reason: 'The venue fell through.',
    status: 'OPEN',
    raisedById: officer,
    raisedAt: stamp,
    forwardedById: null,
    forwardedAt: null,
    forwardNote: null,
    resolvedAt: null,
    resolutionNote: null,
    resolutionLevel: null,
    updatedAt: stamp,
    raisedBy: { id: officer, fullName: 'Synthetic officer' },
    forwardedBy: null,
    resolvedBy: null,
    ...overrides,
  }
}

function setup(row = escalationRow(), activityStatus = 'IN_PROGRESS') {
  const tx = {
    projectActivity: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: activityId, projectId: project, status: activityStatus }),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    projectActivityAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment' }) },
    activityEscalation: {
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
      create: vi.fn().mockResolvedValue({ id: escalationId }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(row),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  return { tx, service: new ActivityEscalationsService({} as PrismaService) }
}

const raiseBody = { clientMutationId: mutation, reason: 'The venue fell through.' }
const decideBody = {
  note: 'Decision recorded after review.',
  expectedUpdatedAt: stamp.toISOString(),
}
const forwarded = () =>
  escalationRow({
    status: 'FORWARDED',
    forwardedById: manager,
    forwardedAt: stamp,
    forwardNote: 'Needs a program decision.',
    forwardedBy: { id: manager, fullName: 'Synthetic manager' },
  })

describe('ActivityEscalationsService.list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the latest 20 mapped rows and selects only safe activity columns', async () => {
    const { tx, service } = setup()
    const result = await service.list(actor('PROGRAM_MANAGER', programManager), project, activityId)
    expect(activityEscalationResponse.parse(result[0]).id).toBe(escalationId)
    expect(tx.activityEscalation.findMany.mock.calls[0][0]).toMatchObject({
      take: 20,
      orderBy: [{ raisedAt: 'desc' }, { id: 'desc' }],
    })
    const select = tx.projectActivity.findFirst.mock.calls[0][0].select
    expect(Object.keys(select).sort()).toEqual(['id', 'projectId', 'status'])
  })

  it('answers 404 for an activity outside the actor scope', async () => {
    const { tx, service } = setup()
    tx.projectActivity.findFirst.mockResolvedValue(null)
    await expect(
      service.list(actor('PROJECT_MANAGER', manager), project, activityId),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('ActivityEscalationsService.raise', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses an officer without an active activity assignment', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, raiseBody),
    ).rejects.toThrow('An active activity assignment is required.')
    expect(tx.activityEscalation.create).not.toHaveBeenCalled()
  })

  it('lets a manager raise without an activity assignment', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    await service.raise(actor('PROGRAM_MANAGER', programManager), project, activityId, raiseBody)
    expect(tx.projectActivityAssignment.findFirst).not.toHaveBeenCalled()
    expect(tx.activityEscalation.create).toHaveBeenCalled()
  })

  it('refuses a finished activity', async () => {
    const { tx, service } = setup(escalationRow(), 'COMPLETED')
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    await expect(
      service.raise(actor('PROJECT_MANAGER', manager), project, activityId, raiseBody),
    ).rejects.toMatchObject({ status: 409, message: 'A finished activity cannot be escalated.' })
  })

  it('returns the same row when the request id and input are replayed', async () => {
    const { tx, service } = setup()
    const result = await service.raise(
      actor('PROJECT_OFFICER', officer),
      project,
      activityId,
      raiseBody,
    )
    expect(activityEscalationResponse.parse(result).id).toBe(escalationId)
    expect(tx.activityEscalation.create).not.toHaveBeenCalled()
  })

  it('conflicts when the request id is reused with a different reason', async () => {
    const { service } = setup()
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, {
        ...raiseBody,
        reason: 'A completely different reason.',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('conflicts when the activity already has an open escalation', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: escalationId })
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, raiseBody),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a reason that is short after trimming', async () => {
    const { service } = setup()
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, {
        ...raiseBody,
        reason: '   short    ',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('creates an open escalation for the actor and audits it without the text', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    await service.raise(actor('PROJECT_OFFICER', officer), project, activityId, raiseBody)
    expect(tx.projectActivity.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: org,
      project: { organizationId: org, id: { in: [project] } },
    })
    expect(tx.activityEscalation.create.mock.calls[0][0].data).toMatchObject({
      raisedById: officer,
      reason: raiseBody.reason,
    })
    const audit = tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      action: 'ACTIVITY_ESCALATION_RAISED',
      entityType: 'ActivityEscalation',
    })
    expect(audit.changes).toEqual({ activityId })
  })

  it('refuses a finished activity before checking the officer assignment', async () => {
    const { tx, service } = setup(escalationRow(), 'CANCELLED')
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, raiseBody),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.projectActivityAssignment.findFirst).not.toHaveBeenCalled()
  })

  it('lets a Grant Manager raise', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    await service.raise(actor('GRANT_MANAGER', programManager), project, activityId, raiseBody)
    expect(tx.activityEscalation.create).toHaveBeenCalled()
  })

  it('maps a database unique refusal to 409', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    tx.activityEscalation.create.mockRejectedValue({ code: 'P2002' })
    await expect(
      service.raise(actor('PROJECT_OFFICER', officer), project, activityId, raiseBody),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('ActivityEscalationsService.forward', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets the Project Manager forward an open escalation and audits it', async () => {
    const { tx, service } = setup()
    await service.forward(
      actor('PROJECT_MANAGER', manager),
      project,
      activityId,
      escalationId,
      decideBody,
    )
    expect(tx.activityEscalation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'OPEN', updatedAt: stamp },
      data: { status: 'FORWARDED', forwardedById: manager, forwardNote: decideBody.note },
    })
    const audit = tx.auditLog.create.mock.calls[0][0].data
    expect(audit.action).toBe('ACTIVITY_ESCALATION_FORWARDED')
    expect(audit.changes).toEqual({ activityId })
  })

  it('answers 404 for an unknown escalation', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.findFirst.mockResolvedValue(null)
    await expect(
      service.forward(
        actor('PROJECT_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('lets the raiser forward their own escalation', async () => {
    const { tx, service } = setup(escalationRow({ raisedById: manager }))
    await service.forward(
      actor('PROJECT_MANAGER', manager),
      project,
      activityId,
      escalationId,
      decideBody,
    )
    expect(tx.activityEscalation.updateMany).toHaveBeenCalled()
  })

  it.each([
    ['SYSTEM_ADMINISTRATOR', manager],
    ['PROGRAM_MANAGER', programManager],
    ['PROJECT_OFFICER', officer],
  ] as const)('refuses %s', async (role, userId) => {
    const { tx, service } = setup()
    await expect(
      service.forward(actor(role, userId), project, activityId, escalationId, decideBody),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.activityEscalation.updateMany).not.toHaveBeenCalled()
  })

  it('conflicts when the escalation already moved or the version is stale', async () => {
    const moved = setup(forwarded())
    await expect(
      moved.service.forward(
        actor('PROJECT_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 409 })
    const stale = setup()
    await expect(
      stale.service.forward(actor('PROJECT_MANAGER', manager), project, activityId, escalationId, {
        ...decideBody,
        expectedUpdatedAt: '2026-10-18T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(stale.tx.activityEscalation.updateMany).not.toHaveBeenCalled()
  })

  it('conflicts when a concurrent change makes the guarded update match nothing', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.forward(
        actor('PROJECT_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('maps a database role refusal to 403', async () => {
    const { tx, service } = setup()
    tx.activityEscalation.updateMany.mockRejectedValue({ meta: { code: '42501' } })
    await expect(
      service.forward(
        actor('PROJECT_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('ActivityEscalationsService.resolve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves at project level and never touches the activity row', async () => {
    const { tx, service } = setup()
    await service.resolve(
      actor('PROJECT_MANAGER', manager),
      project,
      activityId,
      escalationId,
      decideBody,
    )
    expect(tx.activityEscalation.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'RESOLVED',
      resolvedById: manager,
      resolutionLevel: 'PROJECT',
    })
    expect(tx.projectActivity.updateMany).not.toHaveBeenCalled()
    expect(tx.projectActivity.update).not.toHaveBeenCalled()
    const audit = tx.auditLog.create.mock.calls[0][0].data
    expect(audit.action).toBe('ACTIVITY_ESCALATION_RESOLVED')
    expect(audit.changes).toEqual({ activityId, level: 'PROJECT' })
  })

  it('refuses the raiser resolving at project level', async () => {
    const { service } = setup(escalationRow({ raisedById: manager }))
    await expect(
      service.resolve(
        actor('PROJECT_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a System Administrator and a Grant Manager', async () => {
    for (const role of ['SYSTEM_ADMINISTRATOR', 'GRANT_MANAGER'] as const) {
      const { service } = setup()
      await expect(
        service.resolve(actor(role, otherManager), project, activityId, escalationId, decideBody),
      ).rejects.toMatchObject({ status: 403 })
    }
  })

  it('conflicts on a forwarded escalation', async () => {
    const { service } = setup(forwarded())
    await expect(
      service.resolve(
        actor('PROJECT_MANAGER', otherManager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('ActivityEscalationsService.programResolve', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets the Program Manager resolve a forwarded escalation at program level', async () => {
    const { tx, service } = setup(forwarded())
    await service.programResolve(
      actor('PROGRAM_MANAGER', programManager),
      project,
      activityId,
      escalationId,
      decideBody,
    )
    expect(tx.activityEscalation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'FORWARDED' },
      data: { status: 'RESOLVED', resolvedById: programManager, resolutionLevel: 'PROGRAM' },
    })
    expect(tx.auditLog.create.mock.calls[0][0].data.changes).toEqual({
      activityId,
      level: 'PROGRAM',
    })
  })

  it('refuses the raiser, the forwarder and non Program Managers', async () => {
    const raiser = setup(forwarded())
    await expect(
      raiser.service.programResolve(
        actor('PROGRAM_MANAGER', officer),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 403 })
    const forwarder = setup(forwarded())
    await expect(
      forwarder.service.programResolve(
        actor('PROGRAM_MANAGER', manager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 403 })
    for (const role of ['PROJECT_MANAGER', 'GRANT_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const) {
      const { service } = setup(forwarded())
      await expect(
        service.programResolve(
          actor(role, programManager),
          project,
          activityId,
          escalationId,
          decideBody,
        ),
      ).rejects.toMatchObject({ status: 403 })
    }
  })

  it('conflicts on an open escalation', async () => {
    const { service } = setup()
    await expect(
      service.programResolve(
        actor('PROGRAM_MANAGER', programManager),
        project,
        activityId,
        escalationId,
        decideBody,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })
})
