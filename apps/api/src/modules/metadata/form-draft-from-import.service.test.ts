import type { PrismaService } from '@app/prisma/prisma.service'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { draftFormFromImport } from '@pathways/imports/server'
import { rolePermissions } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({ profile: undefined as unknown }))
vi.mock('@pathways/imports/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pathways/imports/server')>()
  return { ...actual, draftFormFromImport: vi.fn(actual.draftFormFromImport) }
})
vi.mock('../../common/authz/application-profile', () => ({
  readApplicationProfile: vi.fn(async () => state.profile),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const drafterId = '20000000-0000-4000-8000-000000000002'
const reviewerId = '20000000-0000-4000-8000-000000000003'
const secondId = '20000000-0000-4000-8000-000000000009'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-000000000004'
const formId = '40000000-0000-4000-8000-000000000004'
const otherCodeFormId = '40000000-0000-4000-8000-000000000005'
const batchId = '50000000-0000-4000-8000-000000000005'
const foreignBatchId = '50000000-0000-4000-8000-000000000006'
const otherCodeBatchId = '50000000-0000-4000-8000-000000000007'
const unknownBatchId = '50000000-0000-4000-8000-0000000000ff'
const firstNameId = '60000000-0000-4000-8000-000000000001'
const created = new Date('2026-10-22T17:30:00.000Z')
const now = new Date('2026-10-20T00:00:00.000Z')
const privateValue = 'Synthetic-Private-Hobby-4471'

const identity = (role: keyof typeof rolePermissions, userId: string): ApplicationIdentity => ({
  id: `90000000-0000-4000-8000-00000000000${userId.slice(-1)}`,
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [projectId],
})

const fieldRow = (patch: Record<string, unknown> = {}) => ({
  id: firstNameId,
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  isRequired: false,
  isMetadataKey: false,
  isSadddField: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sourceNames: [] as string[],
  valueAliases: null,
  importDefault: null,
  rule: null,
  sequenceNo: 1,
  ...patch,
})

const formRow = (id: string, code: string, version: number, status: string) => ({
  id,
  projectId,
  code,
  version,
  name: 'Attendance',
  description: null,
  formType: 'OTHER',
  status,
  activityId: null,
  journeyStageId: null,
  createdById: reviewerId,
  lastEditedById: reviewerId,
  publishedAt: now,
  archivedAt: null,
  updatedAt: now,
  formField_form: [fieldRow()],
})

const columns = [
  { key: 'column_0001', columnIndex: 1, header: 'First name' },
  { key: 'column_0002', columnIndex: 2, header: 'Hobby' },
  { key: 'column_0003', columnIndex: 3, header: 'Score' },
]
const rawRows = [
  { column_0001: 'Ana', column_0002: privateValue, column_0003: 7 },
  { column_0001: 'Ben', column_0002: 'Chess', column_0003: 9 },
]

// An in-memory store behind just the Prisma calls the draft route and publish make.
function fakeTx() {
  const forms = new Map([
    [formId, formRow(formId, 'attendance', 1, 'PUBLISHED')],
    [otherCodeFormId, formRow(otherCodeFormId, 'other_form', 1, 'PUBLISHED')],
  ])
  const batch = (id: string, pinned: string, patch: Record<string, unknown> = {}) => ({
    id,
    projectId,
    formId: pinned,
    formVersion: 1,
    storageStatus: 'STORED',
    status: 'UPLOADED',
    mappingRevision: 1,
    totalRows: rawRows.length,
    createdAt: created,
    sourceHeaders: columns,
    form: { code: forms.get(pinned)?.code, status: forms.get(pinned)?.status },
    ...patch,
  })
  const batches = new Map([
    [batchId, batch(batchId, formId)],
    [foreignBatchId, batch(foreignBatchId, formId, { projectId: otherProjectId })],
    [otherCodeBatchId, batch(otherCodeBatchId, otherCodeFormId)],
  ])
  const audits: Array<{ data: Record<string, unknown> }> = []
  let lastCreated = ''
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
    dataImportRow: {
      findMany: vi.fn(async (_query: unknown) => rawRows.map((rawData) => ({ rawData }))),
    },
    digitalForm: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; code?: string } }) => {
        if (where.id) return forms.get(where.id) ?? null
        const same = [...forms.values()].filter((form) => form.code === where.code)
        return same.sort((a, b) => b.version - a.version)[0] ?? null
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lastCreated = `70000000-0000-4000-8000-00000000000${forms.size}`
        forms.set(lastCreated, {
          ...formRow(lastCreated, data.code as string, data.version as number, 'DRAFT'),
          createdById: data.createdById as string,
          lastEditedById: data.lastEditedById as string,
          formField_form: [],
        })
        return { id: lastCreated }
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const form = forms.get(where.id)
          if (form) Object.assign(form, data)
          return { count: form ? 1 : 0 }
        },
      ),
    },
    formField: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        const stored = data.map((row, index) =>
          fieldRow({
            ...Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                value === Prisma.DbNull ? null : value,
              ]),
            ),
            id: `80000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
          }),
        )
        const form = forms.get(lastCreated)
        if (form) form.formField_form = stored
      }),
    },
    auditLog: {
      create: vi.fn(async (entry: { data: Record<string, unknown> }) => audits.push(entry)),
    },
  }
  return { tx, audits, batches }
}

describe('draft a form version from a staged import', () => {
  let store: ReturnType<typeof fakeTx>
  let service: MetadataService
  const me = identity('MONITORING_AND_EVALUATION_OFFICER', drafterId)
  const run = (
    actor: ApplicationIdentity,
    body: { batchId: string; expectedMappingRevision: number },
  ) => {
    state.profile = actor
    return service.draftFromImport(actor, projectId, formId, body)
  }

  beforeEach(() => {
    store = fakeTx()
    const prisma = {
      withVerifiedContext: (_context: unknown, work: (tx: unknown) => unknown) => work(store.tx),
    }
    service = new MetadataService(prisma as unknown as PrismaService, {} as never)
  })

  it('M&E creates a draft whose summary matches the drafter output', async () => {
    const result = await run(me, { batchId, expectedMappingRevision: 1 })
    expect(result.form).toMatchObject({ code: 'attendance', version: 2, status: 'DRAFT' })
    expect(result.form.createdByCurrentUser).toBe(true)
    expect(result.form.fields.map((field) => [field.code, field.dataType])).toEqual([
      ['first_name', 'TEXT'],
      ['hobby', 'TEXT'],
      ['score', 'INTEGER'],
    ])
    expect(result.form.fields[1].sourceNames).toEqual(['Hobby'])
    expect(result.summary).toMatchObject({ addedFields: ['hobby', 'score'], needsCheck: [] })
    expect(JSON.stringify(result.summary)).not.toContain(privateValue)
    expect(store.tx.digitalForm.create.mock.calls[0][0].data).toMatchObject({
      version: 2,
      createdById: drafterId,
      lastEditedById: drafterId,
    })
  })

  it('passes every staged value as stored and the Manila upload date to the drafter', async () => {
    await run(me, { batchId, expectedMappingRevision: 1 })
    const input = vi.mocked(draftFormFromImport).mock.calls[0][0]
    // 17:30 UTC on 22 October is already 23 October in Manila.
    expect(input.uploadDate).toBe('2026-10-23')
    expect(input.columns.map((column) => column.values)).toEqual([
      ['Ana', 'Ben'],
      [privateValue, 'Chess'],
      [7, 9],
    ])
    expect(store.tx.dataImportRow.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { rowNumber: 'asc' },
      take: 5_000,
    })
  })

  it('PO is denied (403) before any read', async () => {
    const officer = identity('PROJECT_OFFICER', drafterId)
    await expect(run(officer, { batchId, expectedMappingRevision: 1 })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(store.tx.project.findFirst).not.toHaveBeenCalled()
    expect(store.tx.dataImportBatch.findFirst).not.toHaveBeenCalled()
    expect(store.tx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(store.tx.digitalForm.create).not.toHaveBeenCalled()
  })

  it.each([
    ['another project', foreignBatchId],
    ['another form code', otherCodeBatchId],
    ['an unknown batch', unknownBatchId],
  ])('a batch from %s is 404', async (_name, id) => {
    await expect(run(me, { batchId: id, expectedMappingRevision: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(store.tx.dataImportRow.findMany).not.toHaveBeenCalled()
    expect(store.tx.digitalForm.create).not.toHaveBeenCalled()
  })

  it('a changed mapping revision is 409', async () => {
    await expect(run(me, { batchId, expectedMappingRevision: 0 })).rejects.toMatchObject({
      status: 409,
      message: 'The import changed. Reload before retrying.',
    })
    expect(store.tx.digitalForm.create).not.toHaveBeenCalled()
  })

  it('NOTHING_TO_ADD returns 409 with its code and writes nothing', async () => {
    const batch = store.batches.get(batchId)
    if (batch) batch.sourceHeaders = [columns[0]]
    const error = await run(me, { batchId, expectedMappingRevision: 1 }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Every column is already covered by the form.',
      code: 'NOTHING_TO_ADD',
    })
    expect(store.tx.digitalForm.create).not.toHaveBeenCalled()
    expect(store.audits).toHaveLength(0)
  })

  it('an open draft of the code keeps the existing 409', async () => {
    await run(me, { batchId, expectedMappingRevision: 1 })
    await expect(run(me, { batchId, expectedMappingRevision: 1 })).rejects.toMatchObject({
      status: 409,
      message: 'A newer form version already exists; open that version instead.',
    })
  })

  it('audit has counts only', async () => {
    const result = await run(me, { batchId, expectedMappingRevision: 1 })
    const draftAudit = store.audits.find((entry) => entry.data.action === 'FORM_DRAFT_FROM_IMPORT')
    expect(draftAudit?.data).toMatchObject({
      entityType: 'DigitalForm',
      entityId: result.form.id,
      changes: { batchId, version: 2, addedFields: 2, needsCheck: 0 },
    })
    expect(Object.keys(draftAudit?.data.changes as object).sort()).toEqual([
      'addedFields',
      'batchId',
      'needsCheck',
      'version',
    ])
    expect(JSON.stringify(store.audits)).not.toContain(privateValue)
    expect(JSON.stringify(store.audits)).not.toContain('Hobby')
  })

  it('the drafter cannot publish it; a second M&E can', async () => {
    const { form } = await run(me, { batchId, expectedMappingRevision: 1 })
    await expect(
      service.publishForm(me, projectId, form.id, { expectedUpdatedAt: form.updatedAt }),
    ).rejects.toMatchObject({ status: 403 })
    const second = identity('MONITORING_AND_EVALUATION_OFFICER', secondId)
    state.profile = second
    const published = await service.publishForm(second, projectId, form.id, {
      expectedUpdatedAt: form.updatedAt,
    })
    expect(published.status).toBe('PUBLISHED')
  })
})
