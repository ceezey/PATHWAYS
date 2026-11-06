import { createHash } from 'node:crypto'

import type { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { stageFixtureSheet } from '@pathways/imports/form-draft/futuremakers-stage-fixture'
import { detectFileParts, parseSecureImport } from '@pathways/imports/server'
import { rolePermissions } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { StorageService } from '../storage/storage.service'
import { FormDraftFromStageService } from './form-draft-from-stage.service'

const state = vi.hoisted(() => ({
  actor: undefined as unknown as ApplicationIdentity,
  tx: undefined as unknown as Tx,
}))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const foreignBatchId = '50000000-0000-4000-8000-000000000006'
const activityId = 'a1000000-0000-4000-8000-000000000001'
const secondActivityId = 'a1000000-0000-4000-8000-000000000002'
const foreignActivityId = 'a1000000-0000-4000-8000-000000000003'
const cancelledActivityId = 'a1000000-0000-4000-8000-000000000004'
const now = new Date('2026-10-22T10:00:00.000Z')

const csv = Buffer.from(
  stageFixtureSheet(12)
    .map((row) => row.join(','))
    .join('\n'),
)
let parts: Awaited<ReturnType<typeof partsOf>>
const partsOf = async () => detectFileParts(await parseSecureImport(csv, 'CSV'))
beforeAll(async () => {
  parts = await partsOf()
})

const identity = (permissions = rolePermissions.MONITORING_AND_EVALUATION_OFFICER) =>
  ({
    id: '90000000-0000-4000-8000-000000000009',
    aal: 'aal2',
    userId,
    organizationId,
    fullName: 'Synthetic actor',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [...permissions],
    assignedProjectIds: [projectId],
  }) as ApplicationIdentity

const fieldRow = (row: Record<string, unknown>, index: number) => ({
  ...Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === Prisma.DbNull ? null : value]),
  ),
  id: `80000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
})

type StoredForm = Record<string, unknown> & {
  formField_form: Array<{ code: string; sourceNames: string[] }>
  importDraftSummary: { needsCheck: unknown[] }
}

type Scope = { organizationId: string; projectId: string }
type FormWhere = Partial<Scope> & {
  id?: string
  code?: string
  status?: { in: string[] }
  formField_form?: { some: { code: string; sourceNames: { has: string } } }
}
// Like Prisma, a filter the query leaves out matches every row, so a service that drops one is caught.
const inScope = (row: Record<string, unknown>, where: Partial<Scope>) =>
  (where.organizationId === undefined || row.organizationId === where.organizationId) &&
  (where.projectId === undefined || row.projectId === where.projectId)

// An in-memory store behind just the Prisma calls the stage draft makes.
function fakeStore() {
  type Stage = Record<string, unknown> & { id: string; name: string; stageOrder: number }
  const stages: Stage[] = []
  const activities = new Map<string, Record<string, unknown>>([
    [activityId, { organizationId, projectId, status: 'NOT_STARTED', archivedAt: null }],
    [secondActivityId, { organizationId, projectId, status: 'IN_PROGRESS', archivedAt: null }],
    [
      foreignActivityId,
      { organizationId, projectId: otherProjectId, status: 'NOT_STARTED', archivedAt: null },
    ],
    [cancelledActivityId, { organizationId, projectId, status: 'CANCELLED', archivedAt: null }],
  ])
  const mappings: Array<{
    organizationId: string
    projectId: string
    activityId: string
    stageId: string
  }> = []
  const forms = new Map<string, StoredForm>()
  const audits: Array<{ data: Record<string, unknown> & { changes: unknown } }> = []
  const batch = (id: string, owner: string, patch: Record<string, unknown> = {}) => ({
    id,
    projectId: owner,
    formId: '40000000-0000-4000-8000-000000000004',
    formVersion: 1,
    parentBatchId: null,
    partCode: null,
    fileParts: parts,
    storageStatus: 'STORED',
    storageBucket: 'uploads',
    storageObjectKey: 'object',
    sourceChecksum: createHash('sha256').update(csv).digest('hex'),
    sourceSheetName: null,
    fileType: 'CSV',
    createdAt: now,
    form: { code: 'registration', status: 'PUBLISHED' },
    ...patch,
  })
  const batches = new Map([
    [batchId, batch(batchId, projectId)],
    [foreignBatchId, batch(foreignBatchId, otherProjectId)],
  ])
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    project: {
      findFirst: vi.fn(async ({ where }: { where: { AND: Array<{ id?: string }> } }) =>
        where.AND.some((clause) => clause.id === projectId) ? { id: projectId } : null,
      ),
    },
    dataImportBatch: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; projectId: string } }) => {
        const row = batches.get(where.id)
        return row && row.projectId === where.projectId ? row : null
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => batches.get(where.id)),
    },
    journeyStage: {
      findMany: vi.fn(async ({ where }: { where: Scope }) =>
        stages.filter((stage) => inScope(stage, where)),
      ),
      findFirst: vi.fn(async ({ where }: { where: Scope & { id: string } }) =>
        stages.find((stage) => stage.id === where.id && inScope(stage, where)),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const stage = {
          archivedAt: null,
          isTerminal: false,
          ...data,
          id: `b1000000-0000-4000-8000-00000000000${stages.length + 1}`,
        } as unknown as Stage
        stages.push(stage)
        return { id: stage.id }
      }),
    },
    projectActivity: {
      findFirst: vi.fn(
        async ({
          where,
        }: { where: Scope & { id: string; archivedAt: null; status?: { not: string } } }) => {
          const row = activities.get(where.id)
          const usable = row && inScope(row, where) && row.archivedAt === where.archivedAt
          return usable && (!where.status || row.status !== where.status.not)
            ? { id: where.id }
            : null
        },
      ),
    },
    activityJourneyStageMapping: {
      findMany: vi.fn(
        async ({ where }: { where: Scope & { stageId: string; activity?: unknown } }) =>
          mappings.filter(
            (mapping) =>
              inScope(mapping, where) &&
              mapping.stageId === where.stageId &&
              (!where.activity || activities.get(mapping.activityId)?.status !== 'CANCELLED'),
          ),
      ),
      create: vi.fn(async ({ data }: { data: (typeof mappings)[number] }) => {
        mappings.push(data)
        return data
      }),
    },
    digitalForm: {
      findFirst: vi.fn(async ({ where }: { where: FormWhere }) => {
        const match = [...forms.values()].filter(
          (form) =>
            inScope(form, where) &&
            (!where.id || form.id === where.id) &&
            (!where.code || form.code === where.code) &&
            (!where.status || where.status.in.includes(form.status as string)) &&
            (!where.formField_form ||
              form.formField_form.some(
                (field) =>
                  field.code === where.formField_form?.some.code &&
                  field.sourceNames.includes(where.formField_form.some.sourceNames.has),
              )),
        )
        return match.at(-1) ?? null
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `70000000-0000-4000-8000-00000000000${forms.size + 1}`
        forms.set(id, {
          id,
          description: null,
          publishedAt: null,
          archivedAt: null,
          updatedAt: now,
          status: 'DRAFT',
          importDraftSummary: null,
          ...data,
          formField_form: [],
        } as unknown as StoredForm)
        return { id }
      }),
    },
    formField: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        const form = [...forms.values()].at(-1)
        if (form)
          form.formField_form = data.map(fieldRow) as unknown as StoredForm['formField_form']
      }),
    },
    auditLog: {
      create: vi.fn(async (entry: (typeof audits)[number]) => audits.push(entry)),
    },
  }
  return { tx, stages, activities, mappings, forms, audits, batches }
}

describe('draft the stage forms of a participant file', () => {
  let store: ReturnType<typeof fakeStore>
  let service: FormDraftFromStageService
  const storage = { isConfigured: vi.fn(() => true), downloadPrivateFile: vi.fn() }
  const draft = (
    index: number,
    body: { activityId?: string } = {},
    batch = batchId,
    code = parts[index].code,
  ) => {
    return service.draft(state.actor, projectId, batch, code, body)
  }

  beforeEach(() => {
    store = fakeStore()
    state.tx = store.tx as unknown as Tx
    state.actor = identity()
    storage.downloadPrivateFile.mockReset().mockResolvedValue(csv)
    service = new FormDraftFromStageService(
      {} as PrismaService,
      storage as unknown as StorageService,
    )
  })

  it('creates the journey stage and waits when there is no activity', async () => {
    const result = await draft(0)
    expect(result).toEqual({ formId: null, stageId: store.stages[0].id, waitingForActivity: true })
    expect(store.stages).toHaveLength(1)
    expect(store.stages[0]).toMatchObject({ name: 'LST Survey', stageType: 'CORE', stageOrder: 1 })
    expect(store.forms.size).toBe(0)
    expect(store.audits.map((entry) => entry.data.action)).toEqual([
      'JOURNEY_STAGE_CREATED_FROM_IMPORT',
    ])
  })

  it("drafts once a Project Manager's activity is mapped to the stage", async () => {
    const waiting = await draft(0)
    store.mappings.push({ organizationId, projectId, activityId, stageId: waiting.stageId })
    const result = await draft(0)
    expect(result).toMatchObject({ stageId: waiting.stageId, waitingForActivity: false })
    expect(store.stages).toHaveLength(1)
    const form = store.forms.get(result.formId as string)
    expect(form).toMatchObject({
      code: 'stage_y8678amm8o3',
      formType: 'TRAINING_SURVEY',
      status: 'DRAFT',
      activityId,
      journeyStageId: waiting.stageId,
      createdById: userId,
    })
    expect(form?.formField_form.map((field: { code: string }) => field.code)).toEqual([
      'stage_date',
      'stage_consent',
      'external_identifier_value',
      'first_name',
      'middle_name',
      'last_name',
      'total_score',
    ])
    expect(form?.importDraftSummary.needsCheck).toEqual([
      { fieldCode: 'total_score', reason: 'ANSWER_KEY_NEEDED' },
    ])
  })

  it('reuses a journey stage with the same name', async () => {
    store.stages.push({
      id: 'b1000000-0000-4000-8000-0000000000aa',
      organizationId,
      projectId,
      name: ' lst  SURVEY ',
      stageOrder: 4,
    })
    const result = await draft(0)
    expect(result.stageId).toBe('b1000000-0000-4000-8000-0000000000aa')
    expect(store.tx.journeyStage.create).not.toHaveBeenCalled()
  })

  it('chosen existing activity is mapped and bound', async () => {
    const result = await draft(0, { activityId })
    expect(store.mappings).toEqual([
      expect.objectContaining({ activityId, stageId: result.stageId, sequenceOrder: 1 }),
    ])
    expect(store.forms.get(result.formId as string)).toMatchObject({
      activityId,
      journeyStageId: result.stageId,
    })
    expect(store.audits.map((entry) => entry.data.action)).toContain(
      'STAGE_ACTIVITY_LINKED_FROM_IMPORT',
    )
  })

  it('chosen activity from another project is 404', async () => {
    await expect(draft(0, { activityId: foreignActivityId })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(store.forms.size).toBe(0)
    expect(store.mappings).toHaveLength(0)
  })

  it('cancelled activity cannot be chosen', async () => {
    await expect(draft(0, { activityId: cancelledActivityId })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(store.mappings).toHaveLength(0)
  })

  it('stage mapped to two activities waits for a choice', async () => {
    const waiting = await draft(0)
    store.mappings.push({ organizationId, projectId, activityId, stageId: waiting.stageId })
    store.mappings.push({
      organizationId,
      projectId,
      activityId: secondActivityId,
      stageId: waiting.stageId,
    })
    expect(await draft(0)).toEqual({
      formId: null,
      stageId: waiting.stageId,
      waitingForActivity: true,
    })
    const chosen = await draft(0, { activityId: secondActivityId })
    expect(chosen.formId).not.toBeNull()
    expect(store.forms.get(chosen.formId as string)?.activityId).toBe(secondActivityId)
  })

  it('track stages become branches of the stage before them', async () => {
    const result = await draft(1, { activityId })
    const [parent, branch] = store.stages
    expect(parent).toMatchObject({ name: 'LST Survey', stageType: 'CORE' })
    expect(branch).toMatchObject({
      name: 'Technical Skills Survey',
      stageType: 'BRANCH',
      parentStageId: parent.id,
    })
    expect(branch.stageOrder).toBeGreaterThan(parent.stageOrder as number)
    expect(result.stageId).toBe(branch.id)
  })

  it('second draft of a part returns the same form', async () => {
    const first = await draft(0, { activityId })
    const second = await draft(0, { activityId })
    expect(second).toEqual(first)
    expect(store.forms.size).toBe(1)
    expect(store.stages).toHaveLength(1)
  })

  it('lacking journeys.manage is refused before any write', async () => {
    state.actor = identity(
      rolePermissions.MONITORING_AND_EVALUATION_OFFICER.filter(
        (permission) => permission !== 'journeys.manage',
      ),
    )
    await expect(draft(0, { activityId })).rejects.toBeInstanceOf(ForbiddenException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
    expect(store.tx.journeyStage.create).not.toHaveBeenCalled()
    expect(store.tx.digitalForm.create).not.toHaveBeenCalled()
    expect(store.audits).toHaveLength(0)
  })

  it('part not in the batch is 404', async () => {
    await expect(draft(0, {}, batchId, 'NoSuchPart')).rejects.toBeInstanceOf(NotFoundException)
    expect(store.tx.journeyStage.create).not.toHaveBeenCalled()
  })

  it('batch from another project is 404', async () => {
    await expect(draft(0, {}, foreignBatchId)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
    expect(store.tx.journeyStage.create).not.toHaveBeenCalled()
  })

  it('audit has counts and no values', async () => {
    const result = await draft(0, { activityId })
    const audited = JSON.stringify(store.audits)
    for (const value of ['S0R', 'Pangalan', 'Total Score', 'Apelyido', 'LST Survey']) {
      expect(audited).not.toContain(value)
    }
    const created = store.audits.find((entry) => entry.data.action === 'FORM_DRAFT_FROM_IMPORT')
    expect(created?.data).toMatchObject({ entityId: result.formId, entityType: 'DigitalForm' })
    expect(created?.data.changes).toEqual({
      code: 'stage_y8678amm8o3',
      version: 1,
      fieldCount: 7,
      batchId,
      partCode: parts[0].code,
      needsCheck: 1,
    })
  })
})
