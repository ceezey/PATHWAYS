import { ConflictException } from '@nestjs/common'
import { type FieldIntakeRule, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { fakeRowCounts, isRowCountsQuery } from './batch-row-counts.harness'
import { mapStoredBatch } from './import-batches.service'
import { claimBatchRows } from './import-claims.service'
import type { PromotionContext, PromotionHandlers } from './import-promotion-context.service'
import { promoteStageInTx } from './import-stage-promotion.service'
import { valueHash } from './participant-match'

// The people-facing journey stage read (the current stage and the track percent) is proved against the real SQL
// function in prisma/tests/stage-import-runtime.sql, because only that function decides them.

const organizationId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const parentId = '50000000-0000-4000-8000-000000000005'
const childId = '50000000-0000-4000-8000-000000000006'
const registrationFormId = '40000000-0000-4000-8000-000000000004'
const stageFormId = '40000000-0000-4000-8000-000000000007'
const activityId = '61000000-0000-4000-8000-000000000001'
const stageId = '62000000-0000-4000-8000-000000000001'
const enrollmentId = '81000000-0000-4000-8000-000000000001'
const beneficiaryId = '71000000-0000-4000-8000-000000000001'
const claimId = '80000000-0000-4000-8000-000000000008'

const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: [...rolePermissions.PROJECT_OFFICER],
  assignedProjectIds: [projectId],
}

const rule: FieldIntakeRule = {
  kind: 'TOTAL_SCORE',
  questions: [
    { field: 'q1', answers: ['A'] },
    { field: 'q2', answers: ['B'] },
    { field: 'q3', answers: ['C'] },
  ],
}

const field = (code: string, dataType: string, patch: Record<string, unknown> = {}) => ({
  id: `f-${code}`,
  code,
  label: code,
  dataType,
  isRequired: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  isMetadataKey: false,
  isSadddField: false,
  sourceNames: null,
  valueAliases: null,
  importDefault: null,
  rule: null,
  ...patch,
})
const stageFields = [
  field('stage_date', 'DATE'),
  field('stage_consent', 'BOOLEAN'),
  field('external_identifier_value', 'TEXT'),
  field('first_name', 'TEXT'),
  field('middle_name', 'TEXT'),
  field('last_name', 'TEXT'),
  field('age', 'INTEGER', {
    rule: { kind: 'AGE_AT_DATE', birthField: 'b', atField: 'stage_date' },
  }),
  field('q1', 'TEXT'),
  field('q2', 'TEXT'),
  field('q3', 'TEXT'),
  field('total_score', 'INTEGER', { rule }),
] as unknown as NonNullable<PromotionContext['fields']>

const stageRow = {
  stage_date: '2026-03-10',
  stage_consent: true,
  external_identifier_value: '2024-001',
  first_name: 'Ana',
  middle_name: 'Santos',
  last_name: 'Cruz',
  age: 17,
  q1: 'A',
  q2: 'B',
  q3: 'X',
  total_score: 2,
}

type Rec = Record<string, unknown>
interface Store {
  rows: Rec[]
  batches: Rec[]
  identifiers: Rec[]
  beneficiaries: Rec[]
  enrollments: Rec[]
  submissions: Rec[]
  participations: Rec[]
  events: Rec[]
  assessments: Rec[]
  rejections: Rec[]
  audits: Rec[]
}
let store: Store
let ids = 0

// Strict equality on every key of the filter, so a missing scope key fails the lookup like the database would.
const matches = (record: Rec, where: Rec): boolean =>
  Object.entries(where).every(([key, wanted]) => {
    const value = record[key]
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
      const op = wanted as Rec
      if ('in' in op) return (op.in as unknown[]).includes(value)
      if ('lt' in op) return (value as number | Date) < (op.lt as number | Date)
      if ('gte' in op) return (value as number) >= (op.gte as number)
      if ('not' in op) return value !== op.not
      return matches((value ?? {}) as Rec, op)
    }
    return value === wanted
  })
const apply = (record: Rec, data: Rec) => {
  for (const [key, value] of Object.entries(data)) {
    record[key] =
      value && typeof value === 'object' && 'increment' in value
        ? (record[key] as number) + (value as { increment: number }).increment
        : value
  }
  return record
}
const find = (list: Rec[], where: Rec) => list.find((item) => matches(item, where)) ?? null
const create = (list: Rec[], prefix: string, data: Rec) => {
  const record = { id: `${prefix}-${++ids}`, ...data }
  list.push(record)
  return record
}

function fakeTx(): Tx {
  const tx = {
    project: { findFirst: async () => ({ id: projectId }) },
    dataImportBatch: {
      findFirst: async ({ where }: { where: Rec }) => find(store.batches, where),
      findUnique: async ({ where }: { where: Rec }) => find(store.batches, where),
      update: async ({ where, data }: { where: Rec; data: Rec }) =>
        apply(find(store.batches, where) as Rec, data),
    },
    dataImportRow: {
      findFirst: async ({ where }: { where: Rec }) => find(store.rows, where),
      updateMany: async ({ where, data }: { where: Rec; data: Rec }) => {
        const hit = store.rows.filter((row) => matches(row, where))
        for (const row of hit) apply(row, data)
        return { count: hit.length }
      },
      update: async ({ where, data }: { where: Rec; data: Rec }) =>
        apply(find(store.rows, where) as Rec, data),
    },
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes('FOR UPDATE')) return [{ id: childId }]
      if (isRowCountsQuery(query)) {
        const [batchId] = query.values
        return fakeRowCounts(store.rows.filter((row) => row.importBatchId === batchId) as never)
      }
      const parentRows = (parent: unknown) =>
        store.rows.filter((row) => row.importBatchId === parent)
      const waits = (row: Rec, parent: unknown) =>
        parentRows(parent).some((p) => p.rowNumber === row.rowNumber && p.status !== 'PROCESSED')
      // Values follow the order the claim query and the waiting count interpolate them.
      if (query.sql.includes('AS waiting')) {
        const [batchId, parent] = query.values
        const own = store.rows.filter(
          (row) => row.importBatchId === batchId && row.status === 'VALID',
        )
        return [{ waiting: own.filter((row) => waits(row, parent)).length }]
      }
      const [org, batchId, mappingRevision, validationRevision, attempts, parent] = query.values
      return store.rows
        .filter(
          (row) =>
            row.organizationId === org &&
            row.importBatchId === batchId &&
            row.status === 'VALID' &&
            row.mappingRevision === mappingRevision &&
            row.validationRevision === validationRevision &&
            (row.processingAttempts as number) < (attempts as number) &&
            !waits(row, parent),
        )
        .sort((a, b) => (a.rowNumber as number) - (b.rowNumber as number))
        .map((row) => ({ id: row.id }))
    },
    digitalForm: {
      findFirst: async ({ where }: { where: Rec }) =>
        find(
          [
            {
              id: stageFormId,
              organizationId,
              projectId,
              version: 1,
              formType: 'TRAINING_SURVEY',
              status: 'PUBLISHED',
              code: 'stage_lst',
              name: 'LST',
              activityId,
              journeyStageId: stageId,
            },
          ],
          where,
        ),
    },
    formField: {
      findMany: async ({ where }: { where: Rec }) =>
        where.formId === stageFormId && where.organizationId === organizationId ? stageFields : [],
      findFirst: async ({ where }: { where: Rec }) =>
        where.formId === registrationFormId && where.code === 'external_identifier_type'
          ? { importDefault: 'STUDENT_ID' }
          : null,
    },
    beneficiaryIdentifier: {
      findUnique: async ({ where }: { where: Rec }) =>
        find(store.identifiers, where.organizationId_identifierType_normalizedValue as Rec),
    },
    beneficiary: {
      findFirst: async ({ where }: { where: Rec }) => find(store.beneficiaries, where),
    },
    beneficiaryProjectEnrollment: {
      findUnique: async ({ where }: { where: Rec }) =>
        find(store.enrollments, where.organizationId_projectId_beneficiaryId as Rec),
    },
    formSubmission: {
      findFirst: async ({ where }: { where: Rec }) => {
        const found = store.submissions
          .filter((item) => matches(item, where))
          .sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt))[0]
        return found ? { formResponseValue_submission: found.responses } : null
      },
      create: async ({ data }: { data: Rec }) =>
        create(store.submissions, 'sub', { ...data, form: { code: 'stage_lst' }, responses: [] }),
      update: async ({ where, data }: { where: Rec; data: Rec }) =>
        apply(find(store.submissions, where) as Rec, data),
    },
    formResponseValue: {
      createMany: async ({ data }: { data: Rec[] }) => {
        for (const item of data) {
          const submission = find(store.submissions, { id: item.submissionId }) as Rec
          const code = stageFields.find((candidate) => candidate.id === item.fieldId)?.code
          ;(submission.responses as Rec[]).push({ value: item.value, field: { code } })
        }
      },
    },
    importValueRejection: {
      findMany: async ({
        where,
      }: { where: { fieldId: { in: string[] }; valueHash: { in: string[] } } }) =>
        store.rejections.filter(
          (item) =>
            where.fieldId.in.includes(item.fieldId as string) &&
            where.valueHash.in.includes(item.valueHash as string),
        ),
    },
    beneficiaryActivityParticipation: {
      findFirst: async ({ where }: { where: Rec }) => find(store.participations, where),
      create: async ({ data }: { data: Rec }) => create(store.participations, 'part', data),
    },
    beneficiaryJourneyEvent: {
      create: async ({ data }: { data: Rec }) => create(store.events, 'event', data),
    },
    assessmentResult: {
      findFirst: async ({ where }: { where: Rec }) => find(store.assessments, where),
      create: async ({ data }: { data: Rec }) => create(store.assessments, 'assess', data),
    },
    auditLog: { create: async ({ data }: { data: Rec }) => create(store.audits, 'audit', data) },
  }
  return tx as unknown as Tx
}

const context = (): PromotionContext => ({
  batch: {
    id: childId,
    projectId,
    formId: stageFormId,
    formVersion: 1,
    mappingRevision: 1,
    validationRevision: 1,
    reviewedById: userId,
  },
  fields: stageFields,
  parentBatchId: parentId,
  identifierType: 'STUDENT_ID',
  stageForm: {
    id: stageFormId,
    version: 1,
    code: 'stage_lst',
    name: 'LST',
    activityId,
    journeyStageId: stageId,
    scoreRule: rule as Extract<FieldIntakeRule, { kind: 'TOTAL_SCORE' }>,
  },
})

const childRow = (rowNumber: number, data: Rec, status = 'VALID') => ({
  id: `row-${rowNumber}`,
  organizationId,
  projectId,
  importBatchId: childId,
  rowNumber,
  status,
  mappingRevision: 1,
  validationRevision: 1,
  processingAttempts: 0,
  processingClaimId: null,
  processingClaimedAt: null,
  processingErrorCode: null,
  normalizedData: { ...data },
})
const parentRow = (rowNumber: number, status = 'PROCESSED') => ({
  id: `parent-${rowNumber}`,
  organizationId,
  importBatchId: parentId,
  rowNumber,
  status,
  normalizedData: { external_identifier_type: 'STUDENT_ID', external_identifier_value: '2024-001' },
})

const batchRecord = (id: string, patch: Rec) => ({
  id,
  organizationId,
  projectId,
  formId: registrationFormId,
  formVersion: 1,
  status: 'VALIDATED',
  mappingRevision: 1,
  validationRevision: 1,
  validatedMappingRevision: 1,
  processingRevision: 0,
  processingClaimId: null,
  processingClaimedAt: null,
  reviewedById: userId,
  uploadedById: userId,
  parentBatchId: null,
  partCode: null,
  fileParts: null,
  totalRows: 1,
  form: { code: 'stage_lst', name: 'LST', formType: 'TRAINING_SURVEY', status: 'PUBLISHED' },
  uploadedAt: new Date('2026-03-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
  ...patch,
})

beforeEach(() => {
  ids = 0
  store = {
    rows: [childRow(1, stageRow), parentRow(1)],
    batches: [
      batchRecord(parentId, {}),
      batchRecord(childId, { formId: stageFormId, parentBatchId: parentId, partCode: 'lst' }),
    ],
    identifiers: [
      { organizationId, identifierType: 'STUDENT_ID', normalizedValue: '2024-001', beneficiaryId },
    ],
    beneficiaries: [
      {
        id: beneficiaryId,
        organizationId,
        archivedAt: null,
        firstName: 'Ana',
        middleName: 'Santos',
        lastName: 'Cruz',
        consentRecorded: true,
        dataProcessingConsentRecorded: true,
      },
    ],
    enrollments: [
      {
        id: enrollmentId,
        organizationId,
        projectId,
        beneficiaryId,
        enrollmentDate: new Date('2026-01-01T00:00:00Z'),
        endedDate: null,
      },
    ],
    submissions: [],
    participations: [],
    events: [],
    assessments: [],
    rejections: [],
    audits: [],
  }
})

const claim = (rowNumber = 1) => {
  const row = find(store.rows, { importBatchId: childId, rowNumber }) as Rec
  Object.assign(row, { status: 'PROCESSING', processingClaimId: claimId })
  return row
}
const promote = (rowNumber = 1, resolved?: Parameters<typeof promoteStageInTx>[5]) => {
  const row = claim(rowNumber)
  return promoteStageInTx(fakeTx(), actor, context(), row.id as string, claimId, resolved)
}
const rowOf = (rowNumber = 1) => find(store.rows, { importBatchId: childId, rowNumber }) as Rec
const wroteNothing = () => {
  expect(store.submissions).toHaveLength(0)
  expect(store.participations).toHaveLength(0)
  expect(store.events).toHaveLength(0)
  expect(store.assessments).toHaveLength(0)
}
const held = (code: string) => {
  expect(rowOf()).toMatchObject({ status: 'UNPROCESSED', processingErrorCode: code })
  expect(store.audits.at(-1)).toMatchObject({ action: 'IMPORT_STAGE_REVIEW_REQUIRED' })
  wroteNothing()
}
const firstStage = () => promote()
const withBaseline = (answers: Rec) =>
  store.submissions.push({
    id: 'earlier',
    organizationId,
    projectId,
    beneficiaryId,
    status: 'VALIDATED',
    submittedAt: new Date('2026-02-01T00:00:00Z'),
    form: { code: 'stage_lst' },
    responses: Object.entries(answers).map(([code, value]) => ({ value, field: { code } })),
  })

describe('promoteStageInTx', () => {
  it('adds a submission linked to the person, one participation and one journey event', async () => {
    await firstStage()
    expect(store.submissions).toHaveLength(1)
    expect(store.submissions[0]).toMatchObject({
      beneficiaryId,
      status: 'VALIDATED',
      importRowId: 'row-1',
      source: 'IMPORTED_DATASET',
    })
    expect(store.submissions[0]).not.toHaveProperty('enrollmentId')
    expect(store.participations).toEqual([
      expect.objectContaining({
        enrollmentId,
        activityId,
        attendanceStatus: 'PRESENT',
        progressStatus: 'IN_PROGRESS',
        participationDate: new Date('2026-03-10T00:00:00Z'),
        sourceSubmissionId: store.submissions[0]?.id,
      }),
    ])
    expect(store.events).toEqual([
      expect.objectContaining({
        enrollmentId,
        activityId,
        stageId,
        participationId: store.participations[0]?.id,
        eventType: 'PARTICIPATION',
        eventDate: new Date('2026-03-10T00:00:00Z'),
        description: 'LST recorded',
      }),
    ])
    expect(rowOf()).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'CREATED',
      processingClaimId: null,
    })
    expect(rowOf()).not.toHaveProperty('matchedBeneficiaryId')
  })

  it('a later stage of the same activity adds a submission but no second participation', async () => {
    store.participations.push({ id: 'old', organizationId, projectId, enrollmentId, activityId })
    await firstStage()
    expect(store.submissions).toHaveLength(1)
    expect(store.participations).toHaveLength(1)
    expect(store.events).toHaveLength(0)
  })

  it('scored stage records one OTHER assessment with the key question count as maximum', async () => {
    await firstStage()
    expect(store.assessments).toEqual([
      expect.objectContaining({
        type: 'OTHER',
        score: 2,
        maximumScore: 3,
        activityId,
        enrollmentId,
        assessmentDate: new Date('2026-03-10T00:00:00Z'),
        sourceSubmissionId: store.submissions[0]?.id,
      }),
    ])
  })

  it('blank score records no assessment', async () => {
    ;(rowOf().normalizedData as Rec).total_score = null
    await firstStage()
    expect(store.submissions).toHaveLength(1)
    expect(store.assessments).toHaveLength(0)
  })

  it('same score as the latest assessment records no second one', async () => {
    store.assessments.push({
      id: 'old',
      organizationId,
      projectId,
      enrollmentId,
      activityId,
      score: '2.0000',
    })
    await firstStage()
    expect(store.assessments).toHaveLength(1)
  })

  it('imported score is left out of the pre/post improvement figure', async () => {
    await firstStage()
    // The improvement figure reads only PRE_TEST and POST_TEST results.
    expect(store.assessments.map((item) => item.type)).toEqual(['OTHER'])
  })

  it('identical stage adds nothing', async () => {
    withBaseline({ ...stageRow })
    await firstStage()
    // Only the earlier submission exists, and nothing else was written.
    expect(store.submissions).toEqual([expect.objectContaining({ id: 'earlier' })])
    expect(store.participations).toHaveLength(0)
    expect(store.events).toHaveLength(0)
    expect(store.assessments).toHaveLength(0)
    expect(rowOf()).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'UNCHANGED',
      matchedBeneficiaryId: beneficiaryId,
    })
    expect(store.audits.at(-1)).toMatchObject({ action: 'IMPORT_STAGE_UNCHANGED' })
  })

  it('changed answer is held STAGE_CHANGED and writes nothing', async () => {
    withBaseline({ ...stageRow, q1: 'Z' })
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'UNPROCESSED', processingErrorCode: 'STAGE_CHANGED' })
    expect(store.submissions).toHaveLength(1)
    expect(store.participations).toHaveLength(0)
    expect(store.assessments).toHaveLength(0)
  })

  it('rejected value is not held again', async () => {
    withBaseline({ ...stageRow, q1: 'Z' })
    store.rejections.push({ fieldId: 'f-q1', valueHash: valueHash('A') })
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'UNCHANGED' })
  })

  it('age recalculation does not hold', async () => {
    withBaseline({ ...stageRow, age: 16 })
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'UNCHANGED' })
  })

  it('date missing is held', async () => {
    ;(rowOf().normalizedData as Rec).stage_date = null
    await firstStage()
    held('STAGE_DATE_MISSING')
  })

  it('date outside the enrollment is held', async () => {
    ;(rowOf().normalizedData as Rec).stage_date = '2025-12-31'
    await firstStage()
    held('STAGE_DATE_OUTSIDE_ENROLLMENT')
    ;(store.enrollments[0] as Rec).endedDate = new Date('2026-03-01T00:00:00Z')
    Object.assign(rowOf().normalizedData as Rec, { stage_date: '2026-03-02' })
    store.audits.length = 0
    await promote()
    held('STAGE_DATE_OUTSIDE_ENROLLMENT')
  })

  it('consent not given is held', async () => {
    ;(rowOf().normalizedData as Rec).stage_consent = false
    await firstStage()
    held('STAGE_CONSENT_MISSING')
  })

  it('name differing from the profile is held STAGE_IDENTITY_MISMATCH', async () => {
    ;(rowOf().normalizedData as Rec).last_name = 'Reyes'
    await firstStage()
    held('STAGE_IDENTITY_MISMATCH')
  })

  it('name differing only in case or spaces, or blank on the profile, matches', async () => {
    Object.assign(rowOf().normalizedData as Rec, { first_name: ' ANA ', last_name: 'cruz' })
    ;(store.beneficiaries[0] as Rec).middleName = null
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
  })

  it('stage ID differing from the registration ID is held STAGE_IDENTITY_MISMATCH', async () => {
    ;(rowOf().normalizedData as Rec).external_identifier_value = '2024-999'
    await firstStage()
    held('STAGE_IDENTITY_MISMATCH')
  })

  it('unknown or missing ID is held STAGE_IDENTITY_MISMATCH', async () => {
    ;(store.rows.find((row) => row.id === 'parent-1') as Rec).normalizedData = {
      external_identifier_value: '   ',
    }
    await firstStage()
    held('STAGE_IDENTITY_MISMATCH')
  })

  it('delta file without registration answers finds the person by the stage ID', async () => {
    store.rows = store.rows.filter((row) => row.importBatchId !== parentId)
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
    expect(store.submissions[0]).toMatchObject({ beneficiaryId })
  })

  it("held stage does not stop the same row's other stages", async () => {
    const other = {
      ...context(),
      batch: { ...context().batch, id: '50000000-0000-4000-8000-000000000099' },
    }
    store.rows.push({
      ...childRow(1, stageRow),
      id: 'other-1',
      importBatchId: other.batch.id,
      status: 'PROCESSING',
      processingClaimId: claimId,
    })
    ;(rowOf().normalizedData as Rec).stage_consent = false
    await firstStage()
    expect(rowOf()).toMatchObject({ status: 'UNPROCESSED' })
    await promoteStageInTx(fakeTx(), actor, other, 'other-1', claimId)
    expect(store.rows.find((row) => row.id === 'other-1')).toMatchObject({ status: 'PROCESSED' })
  })

  it('second process of a claimed row is a conflict', async () => {
    await firstStage()
    await expect(
      promoteStageInTx(fakeTx(), actor, context(), 'row-1', claimId),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(store.submissions).toHaveLength(1)
  })

  it('a resolved row uses the resolved values', async () => {
    await promote(1, { values: { ...stageRow, last_name: 'Cruz', q3: 'C', total_score: 3 } })
    expect(store.assessments[0]).toMatchObject({ score: 3 })
  })

  it('audit has ids and codes, no values', async () => {
    await firstStage()
    store.rows.push(childRow(2, { ...stageRow, stage_consent: false }))
    store.rows.push(parentRow(2))
    await promote(2)
    const text = JSON.stringify(store.audits.map((item) => item.changes))
    for (const secret of ['Ana', 'Cruz', 'Santos', '2024-001', '2026-03-10']) {
      expect(text).not.toContain(secret)
    }
    expect(store.audits.map((item) => item.action)).toEqual([
      'IMPORT_STAGE_ROW_COMMITTED',
      'IMPORT_STAGE_REVIEW_REQUIRED',
    ])
    expect(store.audits[0]?.changes).toEqual({
      importBatchId: childId,
      sourceRowNumber: 1,
      beneficiaryId,
      enrollmentId,
      submissionId: store.submissions[0]?.id,
    })
    expect(store.audits[1]?.changes).toEqual({
      importBatchId: childId,
      sourceRowNumber: 2,
      code: 'STAGE_CONSENT_MISSING',
    })
  })
})

describe('claiming a stage batch', () => {
  const handlers = {} as PromotionHandlers
  const input = { expectedValidationRevision: 1 }
  const claimStage = () =>
    claimBatchRows(fakeTx(), actor, handlers, projectId, childId, input as never)

  it('waits for a held registration row', async () => {
    ;(store.rows.find((row) => row.id === 'parent-1') as Rec).status = 'UNPROCESSED'
    const result = await claimStage()
    expect(result).toMatchObject({ complete: true, rowIds: [] })
    expect(rowOf()).toMatchObject({ status: 'VALID' })
    expect(store.batches.find((item) => item.id === childId)).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
    })
    const detail = await mapStoredBatch(fakeTx(), actor, projectId, childId)
    expect(detail.totals.waiting).toBe(1)
  })

  it('processes once the registration row is processed', async () => {
    ;(store.rows.find((row) => row.id === 'parent-1') as Rec).status = 'UNPROCESSED'
    await claimStage()
    ;(store.rows.find((row) => row.id === 'parent-1') as Rec).status = 'PROCESSED'
    const result = await claimStage()
    expect(result).toMatchObject({ complete: false, rowIds: ['row-1'], stageHandler: true })
    expect(result.context?.stageForm).toMatchObject({
      code: 'stage_lst',
      activityId,
      journeyStageId: stageId,
      scoreRule: rule,
    })
    expect(result.context?.identifierType).toBe('STUDENT_ID')
    await promoteStageInTx(
      fakeTx(),
      actor,
      result.context as PromotionContext,
      'row-1',
      result.claimId,
    )
    expect(rowOf()).toMatchObject({ status: 'PROCESSED' })
    const detail = await mapStoredBatch(fakeTx(), actor, projectId, childId)
    expect(detail.totals.waiting).toBe(0)
  })

  it('a stage row with no registration row does not wait', async () => {
    store.rows = store.rows.filter((row) => row.importBatchId !== parentId)
    expect(await claimStage()).toMatchObject({ rowIds: ['row-1'] })
  })

  it('a processor without the survey permissions is refused before any row is claimed', async () => {
    const limited = { ...actor, permissions: ['imports.process'] }
    await expect(
      claimBatchRows(fakeTx(), limited, handlers, projectId, childId, input as never),
    ).rejects.toThrow('Importing surveys needs')
    expect(rowOf()).toMatchObject({ status: 'VALID' })
  })
})
