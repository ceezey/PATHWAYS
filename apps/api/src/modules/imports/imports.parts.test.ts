// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  batch,
  formId,
  projectId,
  service,
  state,
  storage,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { stageFixtureSheet } from '@pathways/imports/form-draft/futuremakers-stage-fixture'
import { detectFileParts, parseSecureImport } from '@pathways/imports/server'
import { type FilePart, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { isRowCountsQuery } from './batch-row-counts.harness'
import { partImportId } from './import-parts.service'

const parentId = '50000000-0000-4000-8000-0000000000a1'
const parentKey = '70000000-0000-4000-8000-0000000000a1'
const stageFormId = '40000000-0000-4000-8000-0000000000b1'
const LST = 'y8678aMM8o3'
const TECHNICAL = 'rNP4mvl5PFF'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// The fixture holds no commas or quotes, so a plain join is valid CSV.
const source = Buffer.from(
  stageFixtureSheet(12)
    .map((row) => row.join(','))
    .join('\n'),
)
const sourceChecksum = createHash('sha256').update(source).digest('hex')
const officer = {
  ...actor,
  roles: ['PROJECT_OFFICER'],
  permissions: [...rolePermissions.PROJECT_OFFICER],
}

interface Setup {
  form: { version: number; status: 'PUBLISHED' | 'DRAFT' } | null
  answerKey: boolean
  parts: FilePart[]
  existingVersion: number | null
  children: unknown[]
  started: string[]
  failed: number
  created: Array<Record<string, unknown>>
}
let setup: Setup
let parts: FilePart[]

const parent = (patch: Record<string, unknown> = {}) =>
  batch({
    id: parentId,
    clientImportId: parentKey,
    originalFileName: 'participants.csv',
    sourceChecksum,
    status: 'MAPPED',
    fileParts: setup.parts,
    ...patch,
  })

// A child of the parent for one part, as the reservation and the later reads see it.
const child = (data: Record<string, unknown>, status = 'UPLOADING') =>
  batch({
    ...data,
    originalFileName: 'participants.csv',
    sourceChecksum,
    status,
    storageStatus: status === 'UPLOADING' ? 'RESERVED' : 'STORED',
    mappingRevision: 0,
    totalRows: 0,
    parentBatchId: parentId,
    fileParts: null,
    form: {
      code: 'stage',
      name: 'Stage',
      formType: 'TRAINING_SURVEY',
      status: 'PUBLISHED',
      publishedById: null,
    },
  })

describe('starting the parts of a file', () => {
  useImportsHarness()

  beforeEach(async () => {
    parts = detectFileParts(await parseSecureImport(source, 'CSV'))
    setup = {
      form: { version: 1, status: 'PUBLISHED' },
      answerKey: true,
      parts,
      existingVersion: null,
      children: [],
      started: [],
      failed: 0,
      created: [],
    }
    state.actor = officer
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.dataImportBatch.findFirst.mockImplementation(async ({ where }) => {
      if (where.parentBatchId && where.partCode) {
        const made = setup.created.find((data) => data.formVersion === where.formVersion)
        return made && where.formVersion === setup.existingVersion ? child(made, 'UPLOADED') : null
      }
      if (where.id === parentId) return where.projectId === projectId ? parent() : null
      const made = setup.created.find((data) => data.id === where.id)
      return made
        ? child(made, made.formVersion === setup.existingVersion ? 'UPLOADED' : 'UPLOADING')
        : null
    })
    tx.dataImportBatch.findUnique.mockImplementation(async ({ where }) => {
      const made = setup.created.find((data) => data.id === where.id)
      return made ? child(made) : parent()
    })
    // The start gate asks for the codes of the children that did not fail; the detail asks for the children.
    tx.dataImportBatch.findMany.mockImplementation(async ({ where }) =>
      where.status ? setup.started.map((partCode) => ({ partCode })) : setup.children,
    )
    tx.dataImportBatch.count.mockImplementation(async () => setup.failed)
    tx.dataImportBatch.update.mockImplementation(async ({ data }) => {
      if (data.status === 'FAILED') setup.failed += 1
      return batch()
    })
    tx.dataImportBatch.create.mockImplementation(async ({ data }) => {
      setup.created.push(data)
      return data
    })
    tx.digitalForm.findFirst.mockImplementation(async ({ where }) => {
      if (!setup.form) return null
      if (where.formField_form) {
        return where.status.in.includes(setup.form.status)
          ? { id: stageFormId, name: 'LST', journeyStageId: null, ...setup.form }
          : null
      }
      return { id: stageFormId, version: setup.form.version, formType: 'TRAINING_SURVEY' }
    })
    tx.formField.findMany.mockImplementation(async () => [
      { rule: setup.answerKey ? { kind: 'TOTAL_SCORE', questions: [] } : null },
    ])
    tx.dataImportRow.createMany.mockResolvedValue({ count: 0 })
    tx.dataImportRow.findMany.mockResolvedValue([])
    tx.metadataMapping.findMany.mockResolvedValue([])
    storage.downloadPrivateFile.mockResolvedValue(source)
    storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })
  })

  const start = (code = LST) => service.startFilePart(officer, projectId, parentId, code)
  const stagedRows = () => tx.dataImportRow.createMany.mock.calls.flatMap(([args]) => args.data)
  // Every read of the batch under test answers with this row.
  const serve = (row: unknown) => {
    tx.dataImportBatch.findFirst.mockImplementation(async () => row)
    tx.dataImportBatch.findUnique.mockImplementation(async () => row)
  }
  const claimParent = () => {
    serve(parent({ status: 'VALIDATED', validatedMappingRevision: 1 }))
    return service.process(officer, projectId, parentId, { expectedValidationRevision: 0 })
  }

  it('child holds only its stage columns and file row numbers', async () => {
    await start()

    const [made] = setup.created
    expect(made).toMatchObject({ parentBatchId: parentId, partCode: LST, formId: stageFormId })
    // The stage date, five identity columns and the total score of the LST survey.
    const rows = stagedRows()
    expect(rows).toHaveLength(parts.find((part) => part.code === LST)?.rows ?? -1)
    expect(Object.keys(rows[0].rawData)).toHaveLength(7)
    expect(rows[0].rowNumber).toBe(3)
    expect(rows.every((row) => row.importBatchId === made.id)).toBe(true)
    const finalized = tx.dataImportBatch.update.mock.calls
      .map(([args]) => args.data)
      .find((data) => data.status === 'UPLOADED')
    expect(finalized.sourceHeaders).toHaveLength(7)
    expect(finalized.fileParts).toBeUndefined()
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`/imports/${made.id}/${sourceChecksum}.csv`),
      source,
      'text/csv',
    )
  })

  it('starting a part twice returns the same batch', async () => {
    const first = await start()
    setup.existingVersion = 1
    tx.dataImportBatch.create.mockClear()
    storage.uploadPrivateFile.mockClear()

    const second = await start()

    expect(second.id).toBe(first.id)
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    expect(setup.created[0].clientImportId).toBe(partImportId(parentKey, LST, 1))
  })

  it('newer form version starts a new child', async () => {
    await start()
    setup.existingVersion = 1
    setup.form = { version: 2, status: 'PUBLISHED' }

    await start()

    const [one, two] = setup.created
    expect(two).toMatchObject({ formVersion: 2, parentBatchId: parentId, partCode: LST })
    expect(two.id).not.toBe(one.id)
    expect(two.clientImportId).not.toBe(one.clientImportId)
  })

  it('parent is refused until every part is started', async () => {
    setup.started = [LST]
    await expect(claimParent()).rejects.toThrow('Start every survey in this file first.')

    setup.started = parts.map((part) => part.code)
    await expect(claimParent()).resolves.toMatchObject({ id: parentId })
  })

  it('part with no rows needs no child', async () => {
    const empty = { ...parts[1], code: 'NoRows', rows: 0 }
    setup.parts = [parts[0], empty]
    setup.started = [LST]

    await expect(claimParent()).resolves.toMatchObject({ id: parentId })
    await expect(start('NoRows')).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
  })

  it('no published form is 409 and stages nothing', async () => {
    setup.form = null
    await expect(start()).rejects.toThrow("Publish this survey's form first.")
    setup.form = { version: 1, status: 'DRAFT' }
    await expect(start()).rejects.toBeInstanceOf(ConflictException)

    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
    expect(tx.dataImportRow.createMany).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('missing permission is 403 before any row is staged', async () => {
    const message =
      'Importing surveys needs the record participation, record assessment, read participant records, read journeys and read assessment details permissions.'
    state.actor = actor
    await expect(service.startFilePart(actor, projectId, parentId, LST)).rejects.toThrow(message)
    expect(tx.dataImportBatch.findFirst).not.toHaveBeenCalled()

    serve(child({ id: parentId, partCode: LST, validatedMappingRevision: 1 }, 'VALIDATED'))
    await expect(
      service.process(actor, projectId, parentId, { expectedValidationRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.dataImportRow.createMany).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('scores in the file with no answer key are refused before any row is staged', async () => {
    setup.answerKey = false

    await expect(start()).rejects.toThrow(
      "Mark the correct answers for this survey's total score first.",
    )
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
    expect(tx.dataImportRow.createMany).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()

    // A survey with no score column starts without a key.
    await start(TECHNICAL)
    expect(setup.created).toHaveLength(1)
  })

  it('list shows the parent only; detail lists its parts', async () => {
    await service.listBatches(officer, projectId)
    expect(tx.dataImportBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ parentBatchId: null }) }),
    )

    await start()
    setup.children = [child(setup.created[0], 'UPLOADED')]
    tx.digitalForm.findFirst.mockImplementation(async ({ where }) => {
      const code = where.formField_form.some.sourceNames.has
      const status = code === LST ? 'PUBLISHED' : code === TECHNICAL ? 'DRAFT' : null
      return status && where.status.in.includes(status)
        ? { id: stageFormId, name: `Form ${code}`, status }
        : null
    })

    const detail = await service.getBatch(officer, projectId, parentId)

    expect(
      detail.parts.map((part) => [part.code, part.formStatus, part.batch?.partCode ?? null]),
    ).toEqual([
      [LST, 'PUBLISHED', LST],
      [TECHNICAL, 'DRAFT', null],
      ['p7Wcfe1p4lp', 'NONE', null],
      ['TQFHPAzCaeI', 'NONE', null],
    ])
    expect(detail.parts[0].formName).toBe(`Form ${LST}`)
  })

  it('a person who cannot read journeys or assessment details cannot start a survey', async () => {
    for (const missing of ['journeys.read', 'assessments.detail.read']) {
      const limited = {
        ...officer,
        permissions: officer.permissions.filter((name) => name !== missing),
      }
      state.actor = limited
      await expect(service.startFilePart(limited, projectId, parentId, LST)).rejects.toThrow(
        'Importing surveys needs',
      )
    }
  })

  it('detail shows the newest live child with its created and unchanged counts', async () => {
    const live = child({
      id: '50000000-0000-4000-8000-0000000000d1',
      formVersion: 1,
      partCode: LST,
    })
    const failed = child(
      { id: '50000000-0000-4000-8000-0000000000d2', formVersion: 2, partCode: LST },
      'FAILED',
    )
    setup.children = [failed, live]
    tx.digitalForm.findFirst.mockResolvedValue({
      id: stageFormId,
      name: 'LST',
      status: 'PUBLISHED',
    })
    tx.$queryRaw.mockImplementation(async (sql) =>
      isRowCountsQuery(sql)
        ? (sql as { values: unknown[] }).values[0] === live.id
          ? [
              { status: 'PROCESSED', outcome: 'CREATED', warned: false, rows: 3 },
              { status: 'PROCESSED', outcome: 'UNCHANGED', warned: false, rows: 2 },
            ]
          : []
        : [{ waiting: 1 }],
    )

    const detail = await service.getBatch(officer, projectId, parentId)

    expect(tx.dataImportBatch.findMany.mock.calls.at(-1)?.[0].orderBy).toEqual([
      { formVersion: 'desc' },
      { createdAt: 'desc' },
    ])
    expect(detail.parts[0].batch).toMatchObject({
      id: live.id,
      registrationCounts: { created: 3, updated: 0, unchanged: 2 },
      totals: { waiting: 1 },
    })
  })

  it('a unique conflict on start returns the child the other person made', async () => {
    tx.dataImportBatch.create.mockImplementationOnce(async ({ data }) => {
      setup.created.push(data)
      throw Object.assign(new Error('unique'), { code: 'P2002' })
    })
    setup.existingVersion = 1

    const result = await start()

    expect(result.id).toBe(setup.created[0].id)
  })

  it('resuming a child stages the same part columns', async () => {
    const childId = '50000000-0000-4000-8000-0000000000c1'
    const made = { id: childId, formVersion: 1, partCode: LST, formId: stageFormId }
    setup.created.push(made)
    tx.dataImportBatch.findUnique.mockImplementation(async () => child(made))
    tx.dataImportBatch.findFirst.mockImplementation(async ({ where }) =>
      where.id === parentId ? parent() : child(made),
    )

    await service.resumeUpload(officer, projectId, childId)

    expect(Object.keys(stagedRows()[0].rawData)).toHaveLength(7)
  })

  it('failed part can be started again', async () => {
    // The first start loses the storage write and the check that follows it, which leaves the child FAILED.
    storage.downloadPrivateFile
      .mockResolvedValueOnce(source)
      .mockRejectedValueOnce(new Error('down'))
    storage.uploadPrivateFile.mockRejectedValueOnce(new Error('down'))
    await expect(start()).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(setup.failed).toBe(1)

    const second = await start()

    const [one, two] = setup.created
    expect(two.id).not.toBe(one.id)
    expect(two.clientImportId).toBe(partImportId(parentKey, LST, 1, 1))
    expect(one.clientImportId).toBe(partImportId(parentKey, LST, 1))
    expect(second.id).toBe(two.id)
    // The failed child no longer holds the part's place, and the parent's gate counts only live children.
    expect(tx.dataImportBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ partCode: LST, status: { not: 'FAILED' } }),
      }),
    )
    setup.started = parts.map((part) => part.code)
    await expect(claimParent()).resolves.toMatchObject({ id: parentId })
    expect(tx.dataImportBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'FAILED' } }),
      }),
    )
  })

  it('a part that failed five times is refused with 409 and stages nothing', async () => {
    setup.failed = 5

    await expect(start()).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('an unfailed start keeps its first key', () => {
    expect(partImportId(parentKey, LST, 1, 0)).toBe(partImportId(parentKey, LST, 1))
    expect(partImportId(parentKey, LST, 1, 1)).not.toBe(partImportId(parentKey, LST, 1))
  })

  it('child from another project is 404', async () => {
    const other = '30000000-0000-4000-8000-0000000000ff'
    tx.project.findFirst.mockResolvedValue({ id: other })

    await expect(service.startFilePart(officer, other, parentId, LST)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.dataImportBatch.create).not.toHaveBeenCalled()
  })

  it('a child is not re-run, and its key is a v4-shaped UUID', async () => {
    serve(child({ id: parentId, partCode: LST, uploadedById: actor.userId }, 'UPLOADED'))

    await expect(service.rerun(officer, projectId, parentId, { formId })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(partImportId(parentKey, LST, 1)).toMatch(uuid)
    expect(partImportId(parentKey, LST, 1)).toBe(partImportId(parentKey, LST, 1))
    expect(partImportId(parentKey, LST, 2)).not.toBe(partImportId(parentKey, LST, 1))
  })
})
