// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  batch,
  beneficiaries,
  clientImportId,
  file,
  formId,
  projectId,
  service,
  state,
  storage,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { buildAnySourceFixture } from '@pathways/imports/fixtures/any-source/build'
import { SPECS } from '@pathways/imports/form-draft/draft-test-support'
import { rolePermissions } from '@pathways/shared'
import { describe, expect, it, vi } from 'vitest'

import { createDraftFromImport } from '../metadata/form-draft-from-import.service'
import { createVersion } from '../metadata/form-versions.service'
import { fakeRowCounts, isRowCountsQuery } from './batch-row-counts.harness'

vi.mock('../metadata/form-versions.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../metadata/form-versions.service')>()),
  createVersion: vi.fn(async () => ({ id: 'drafted-form', version: 2 })),
}))

type Json = Record<string, unknown>

// Registration uploads and processing need the officer's beneficiary permissions.
const officer = { ...actor, permissions: [...rolePermissions.MONITORING_AND_EVALUATION_OFFICER] }

// The default registration form with the defaults its first draft sets, as the corpus checks it.
const DEFAULTS: Record<string, string> = {
  registration_operation: 'CREATE',
  subject_type: 'INDIVIDUAL',
}
const fields = SPECS.map(
  ([code, label, dataType, required, metadataKey, sadddField, allowedValues], index) => ({
    id: `41000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    code,
    label,
    dataType,
    isRequired: required,
    isMetadataKey: metadataKey,
    isSadddField: sadddField,
    allowedValues: allowedValues ?? null,
    minimumValue: null,
    maximumValue: null,
    minimumDate: null,
    maximumDate: null,
    minimumLength: null,
    maximumLength: null,
    sourceNames: [],
    valueAliases: null,
    importDefault: DEFAULTS[code] ?? null,
    rule: null,
    sequenceNo: index + 1,
  }),
)
const fieldId = (code: string) => fields.find((field) => field.code === code)?.id ?? null
const form = {
  id: formId,
  projectId,
  code: 'registration',
  version: 1,
  name: 'Registration',
  description: null,
  formType: 'BENEFICIARY_REGISTRATION',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  createdById: actor.userId,
  lastEditedById: actor.userId,
  importDraftSummary: null,
  publishedAt: new Date('2026-09-01T00:00:00.000Z'),
  archivedAt: null,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  formField_form: fields,
}

// The batch, its staged rows and its mappings, behind the Prisma calls the import steps make.
const store = {
  batch: {} as Json & { id: string },
  rows: [] as Array<Json & { id: string; rowNumber: number; status: string }>,
  mappings: [] as Json[],
  recorded: [] as Json[],
}

function matches(row: Json, where: Json) {
  return Object.entries(where).every(([key, condition]) => {
    if (!(key in row)) return true
    const value = row[key]
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const operators = condition as Json
      if ('in' in operators) return (operators.in as unknown[]).includes(value)
      if ('lt' in operators) return value !== null && (value as number) < (operators.lt as number)
      if ('gte' in operators) return (value as number) >= (operators.gte as number)
      return false
    }
    return value === condition
  })
}

function apply(target: Json, data: Json) {
  for (const [key, value] of Object.entries(data)) {
    target[key] =
      value && typeof value === 'object' && 'increment' in value
        ? (target[key] as number) + (value as { increment: number }).increment
        : value
  }
}

function useStore() {
  store.batch = { id: '' }
  store.rows = []
  store.mappings = []
  state.actor = officer
  tx.digitalForm.findFirst.mockResolvedValue(form)
  tx.formField.findMany.mockResolvedValue(fields)
  tx.dataImportBatch.findFirst.mockImplementation(async (args: { where: Json }) =>
    'clientImportId' in args.where || !store.batch.id ? null : structuredClone(store.batch),
  )
  tx.dataImportBatch.findUnique.mockImplementation(async () => structuredClone(store.batch))
  tx.dataImportBatch.create.mockImplementation(async (args: { data: Json }) => {
    store.batch = {
      ...batch({
        sourceHeaders: [],
        storageStatus: 'RESERVED',
        status: 'UPLOADING',
        mappingRevision: 0,
        totalRows: 0,
        form: {
          code: form.code,
          name: form.name,
          formType: form.formType,
          status: 'PUBLISHED',
          publishedById: actor.userId,
        },
      }),
      ...args.data,
    } as Json & { id: string }
    return { id: store.batch.id }
  })
  tx.dataImportBatch.update.mockImplementation(async (args: { data: Json }) => {
    apply(store.batch, args.data)
    return structuredClone(store.batch)
  })
  tx.dataImportRow.createMany.mockImplementation(async (args: { data: Json[] }) => {
    for (const data of args.data)
      store.rows.push({
        ...data,
        id: `61000000-0000-4000-8000-${String(store.rows.length + 1).padStart(12, '0')}`,
        rowNumber: data.rowNumber as number,
        status: 'PENDING',
        mappingRevision: 0,
        validationRevision: 0,
        processingClaimId: null,
        processingAttempts: 0,
        normalizedData: null,
        validationWarnings: [],
      })
    return { count: args.data.length }
  })
  tx.dataImportRow.findMany.mockImplementation(async (args: { where: Json }) =>
    store.rows
      .filter((row) => matches(row, args.where))
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .map((row) => structuredClone(row)),
  )
  tx.dataImportRow.findFirst.mockImplementation(async (args: { where: Json }) => {
    const row = store.rows.find((item) => item.id === args.where.id)
    return row && matches(row, args.where) ? structuredClone(row) : null
  })
  tx.dataImportRow.update.mockImplementation(
    async (args: { where: { id: string }; data: Json }) => {
      const row = store.rows.find((item) => item.id === args.where.id) as Json
      apply(row, args.data)
      return row
    },
  )
  tx.dataImportRow.updateMany.mockImplementation(async (args: { where: Json; data: Json }) => {
    const rows = store.rows.filter((row) => matches(row, args.where))
    for (const row of rows) apply(row, args.data)
    return { count: rows.length }
  })
  tx.metadataMapping.findMany.mockImplementation(async (args: { where?: Json } = {}) =>
    store.mappings.filter((mapping) => matches(mapping, args.where ?? {})),
  )
  tx.metadataMapping.createMany.mockImplementation(async (args: { data: Json[] }) => {
    for (const data of args.data) {
      const target = fields.find((field) => field.id === data.targetFieldId) ?? null
      store.mappings.push({ ...data, dateOrder: null, targetField: target })
    }
    return { count: args.data.length }
  })
  tx.$queryRaw.mockImplementation(async (sql: { sql: string; values: unknown[] }) => {
    if (isRowCountsQuery(sql)) return fakeRowCounts(store.rows)
    if (sql.sql.includes('p78_record_smart_mapping')) {
      // The recorder stores revision 1 as the matcher decided it.
      const decisions = JSON.parse(sql.values[3] as string) as Json[]
      store.recorded = decisions
      for (const decision of decisions)
        store.mappings.push({
          revision: 1,
          sourceFieldName: decision.sourceKey,
          status: decision.status,
          dataType: null,
          valueMap: null,
          dateOrder: null,
          targetField: fields.find((field) => field.id === decision.targetFieldId) ?? null,
        })
      apply(store.batch, { mappingRevision: 1, status: 'MAPPED' })
      const count = (status: string) => decisions.filter((item) => item.status === status).length
      const receipt = {
        batchId: store.batch.id,
        mappingRevision: 1,
        mapped: count('MAPPED'),
        pending: count('PENDING'),
        ignored: count('IGNORED'),
        requiredUnmapped: 0,
        complete: false,
      }
      return [{ receipt }]
    }
    if (sql.sql.includes('validation_warnings')) return []
    return [{ id: store.batch.id }]
  })
  tx.$executeRaw.mockImplementation(async (sql: { values: unknown[] }) => {
    const [mappingRevision, validationRevision] = sql.values.filter(
      (value): value is number => typeof value === 'number',
    )
    const updates = JSON.parse(
      sql.values.find((value) => typeof value === 'string' && value.startsWith('[')) as string,
    ) as Array<{ id: string; status: string; normalized_data: Json | null }>
    for (const update of updates) {
      const row = store.rows.find((item) => item.id === update.id) as Json
      apply(row, {
        status: update.status,
        normalizedData: update.normalized_data,
        mappingRevision,
        validationRevision,
      })
    }
    return updates.length
  })
  storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })
  beneficiaries.readRegistrationForm.mockResolvedValue(null)
  beneficiaries.promoteRegistration.mockImplementation(async () => ({
    kind: 'COMMITTED',
    beneficiaryId: 'beneficiary',
    enrollmentId: 'enrollment',
    submissionId: 'submission',
  }))
}

describe('an any-source masterlist through the import service', () => {
  useImportsHarness()

  it('uploads, maps by AUTO_SMART_V4, drafts, validates and processes every row', async () => {
    useStore()
    const { bytes } = buildAnySourceFixture('masterlist-xlsx')
    const buffer = Buffer.from(bytes)
    await service.upload(
      officer,
      projectId,
      { formId, clientImportId },
      file({
        buffer,
        originalname: 'masterlist.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      }),
    )
    // Rows keep their numbers in the file, below the title, blank and group rows.
    expect(store.rows.map((row) => row.rowNumber)).toEqual([5, 6, 7, 8, 9])
    expect(store.rows[1].rawData).toMatchObject({ column_0007: '+639000000002' })
    const batchId = store.batch.id

    await service.automaticMapping(officer, projectId, batchId, { expectedMappingRevision: 0 })
    const recorder = tx.$queryRaw.mock.calls.find(([sql]) =>
      String(sql.sql).includes('p78_record_smart_mapping'),
    )?.[0] as { values: unknown[] }
    expect(recorder.values.slice(0, 3)).toEqual([batchId, 0, 'AUTO_SMART_V4'])
    const headers = store.batch.sourceHeaders as Array<{ key: string; header: string }>
    const headerOf = (key: unknown) => headers.find((column) => column.key === key)?.header
    const codeOf = (id: unknown) => fields.find((field) => field.id === id)?.code ?? null
    expect(
      store.recorded.map((decision) => [
        headerOf(decision.sourceKey),
        decision.status,
        codeOf(decision.targetFieldId ?? decision.suggestedFieldId),
        decision.reason,
      ]),
    ).toEqual([
      ['Participant ID', 'MAPPED', 'beneficiary_code', 'AUTO_MATCH'],
      ['Unang pangalan', 'MAPPED', 'first_name', 'AUTO_MATCH'],
      ['Apelyido', 'MAPPED', 'last_name', 'AUTO_MATCH'],
      ['Kasarian', 'PENDING', 'sex', 'SUGGESTED'],
      ['Petsa ng kapanganakan', 'MAPPED', 'birth_date', 'AUTO_MATCH'],
      ['May kapansanan', 'PENDING', 'disability_status', 'HELD_VALUE_GATE'],
      ['Cellphone', 'PENDING', null, 'NO_MATCH'],
      ['Barangay', 'MAPPED', 'location_barangay', 'AUTO_MATCH'],
      ['Bayan', 'MAPPED', 'location_city_municipality', 'AUTO_MATCH'],
      ['Lalawigan', 'MAPPED', 'location_province', 'AUTO_MATCH'],
      ['Consent', 'MAPPED', 'consent_recorded', 'AUTO_MATCH'],
      ['Data processing consent', 'MAPPED', 'data_processing_consent_recorded', 'AUTO_MATCH'],
      ['Enrollment date', 'MAPPED', 'enrollment_date', 'AUTO_MATCH'],
    ])

    const drafted = await createDraftFromImport(tx as never, officer, projectId, formId, {
      batchId,
      expectedMappingRevision: 1,
    })
    expect(drafted.summary.addedFields).toEqual(['cellphone'])
    const definition = vi.mocked(createVersion).mock.calls[0][3] as { fields: Json[] }
    expect(definition.fields.find((field) => field.code === 'cellphone')).toMatchObject({
      dataType: 'TEXT',
      sourceNames: ['Cellphone'],
    })

    // The reviewer confirms the suggestions, maps the Filipino disability answers and leaves the phone out.
    const reviewed = store.recorded.map((decision) => {
      const code = codeOf(decision.targetFieldId ?? decision.suggestedFieldId)
      if (!code) return { sourceFieldName: decision.sourceKey as string, ignored: true }
      return {
        sourceFieldName: decision.sourceKey as string,
        targetFieldCode: code,
        ignored: false,
        ...(code === 'disability_status'
          ? {
              valueMap: [
                { from: 'Hindi', to: 'WITHOUT_DISABILITY' },
                { from: 'Oo', to: 'WITH_DISABILITY' },
              ],
            }
          : {}),
      }
    })
    await service.saveMapping(officer, projectId, batchId, {
      expectedMappingRevision: 1,
      mappings: reviewed,
    })

    const validated = await service.validate(officer, projectId, batchId, {
      expectedMappingRevision: 2,
    })
    expect(validated).toMatchObject({ totals: { rows: 5, valid: 5, invalid: 0 } })
    expect(store.rows[1].normalizedData).toMatchObject({
      last_name: 'Cruz',
      sex: 'FEMALE',
      birth_date: '1999-04-03',
      disability_status: 'WITH_DISABILITY',
      location_barangay: 'San Isidro',
      registration_operation: 'CREATE',
      enrollment_date: '2026-01-15',
    })

    const processed = await service.process(officer, projectId, batchId, {
      expectedValidationRevision: 1,
    })
    expect(store.rows.map((row) => row.status)).toEqual(Array(5).fill('PROCESSED'))
    expect(beneficiaries.promoteRegistration).toHaveBeenCalledTimes(5)
    expect(processed).toMatchObject({ status: 'PROCESSED', totals: { processed: 5 } })
  })
})
