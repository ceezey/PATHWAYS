import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { ParticipantsService } from '../participants/participants.service'
const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
  denied: false,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_p, _i, _permission, work) => {
    if (state.denied) throw new ForbiddenException('Unavailable')
    return work(state.tx, state.actor)
  }),
}))
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { MetadataService } from './metadata.service'
const org = '10000000-0000-4000-8000-000000000001'
const user = '20000000-0000-4000-8000-000000000002'
const project = '30000000-0000-4000-8000-000000000003'
const id = '40000000-0000-4000-8000-000000000004'
const actor = {
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  organizationId: org,
  userId: user,
  roles: ['PROJECT_OFFICER'],
  permissions: ['forms.read'],
  assignedProjectIds: [project],
} as ApplicationIdentity
const fields = [
  {
    id: '50000000-0000-4000-8000-000000000005',
    code: 'score',
    label: 'Score',
    dataType: 'INTEGER',
    required: true,
    metadataKey: false,
    sadddField: false,
    allowedValues: null,
    minimumLength: null,
    maximumLength: null,
    sequence: 1,
  },
]
const payload = {
  id,
  projectId: project,
  code: 'synthetic',
  version: 1,
  name: 'Synthetic form',
  description: null,
  formType: 'ACTIVITY_MONITORING',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdByCurrentUser: true,
  fields,
}
const setup = () => {
  let fingerprint = 'a'.repeat(64)
  let currentPayload = payload
  const tx = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: project }) },
    digitalForm: { findFirst: vi.fn() },
    $queryRaw: vi.fn(async (_query: unknown, ...values: unknown[]) => [
      {
        status: currentPayload.status,
        fingerprint,
        fieldCount: 1,
        sourceBytes: 1000n,
        payload:
          currentPayload.status === 'PUBLISHED' && values.at(-2) === fingerprint
            ? null
            : { ...currentPayload, createdByCurrentUser: state.actor?.userId === user },
      },
    ]),
  }
  state.tx = tx as unknown as Prisma.TransactionClient
  return {
    tx,
    service: new MetadataService({} as PrismaService, {} as ParticipantsService),
    setSource: (revision: string, data = payload) => {
      fingerprint = revision
      currentPayload = data
    },
  }
}
beforeEach(() => {
  state.actor = actor
  state.denied = false
  vi.mocked(withAuthorizedOperation).mockClear()
})
describe('atomic definition source verification before cache reuse', () => {
  it('rechecks current authority/project/whole source even on a hit, without a nested Prisma field read', async () => {
    const { tx, service } = setup()
    expect((await service.getForm(actor, project, id)).fields).toEqual(fields)
    expect((await service.getForm(actor, project, id)).fields).toEqual(fields)
    expect(withAuthorizedOperation).toHaveBeenCalledTimes(2)
    expect(tx.project.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.$queryRaw.mock.calls.map((call) => call.at(-2))).toEqual([null, 'a'.repeat(64)])
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    state.denied = true
    await expect(service.getForm(actor, project, id)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('cannot return a cached payload after project assignment/scope disappears', async () => {
    const { tx, service } = setup()
    await service.getForm(actor, project, id)
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.getForm(actor, project, id)).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('uses changed fields from another process at the same timestamp and isolates current actor variants', async () => {
    const { tx, service, setSource } = setup()
    await service.getForm(actor, project, id)
    const changed = { ...payload, fields: [{ ...fields[0], label: 'Changed elsewhere' }] }
    setSource('b'.repeat(64), changed)
    expect((await service.getForm(actor, project, id)).fields).toEqual(changed.fields)
    expect(tx.$queryRaw.mock.calls.at(-1)?.at(-2)).toBe('a'.repeat(64))
    state.actor = { ...actor, userId: '20000000-0000-4000-8000-000000000009' }
    expect((await service.getForm(actor, project, id)).createdByCurrentUser).toBe(false)
    expect(tx.$queryRaw.mock.calls.at(-1)?.at(-2)).toBeNull()
  })
  it('does not reuse a warmed actor payload after a current grant or assignment revision', async () => {
    const { tx, service } = setup()
    await service.getForm(actor, project, id)
    state.actor = { ...actor, permissions: ['forms.read', 'projects.read'] }
    await service.getForm(actor, project, id)
    expect(tx.$queryRaw.mock.calls.at(-1)?.at(-2)).toBeNull()
    state.actor = {
      ...actor,
      assignedProjectIds: [project, '30000000-0000-4000-8000-000000000009'],
    }
    await service.getForm(actor, project, id)
    expect(tx.$queryRaw.mock.calls.at(-1)?.at(-2)).toBeNull()
    expect(withAuthorizedOperation).toHaveBeenCalledTimes(3)
    expect(tx.project.findFirst).toHaveBeenCalledTimes(3)
  })
  it('does not reuse or retain a published cache after current source is archived', async () => {
    const { tx, service, setSource } = setup()
    await service.getForm(actor, project, id)
    setSource('b'.repeat(64), { ...payload, status: 'ARCHIVED' })
    expect((await service.getForm(actor, project, id)).status).toBe('ARCHIVED')
    await service.getForm(actor, project, id)
    expect(tx.$queryRaw.mock.calls.at(-1)?.at(-2)).toBeNull()
  })
})
