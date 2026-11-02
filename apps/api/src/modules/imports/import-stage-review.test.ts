import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { type FieldIntakeRule, hasAtomicPermission, rolePermissions } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { fakeRowCounts, isRowCountsQuery } from './batch-row-counts.harness'
import { ImportReviewService } from './import-review.service'
import { valueHash } from './participant-match'

type Rec = Record<string, unknown>

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-000000000099'
const parentId = '50000000-0000-4000-8000-000000000005'
const childId = '50000000-0000-4000-8000-000000000006'
const registrationFormId = '40000000-0000-4000-8000-000000000004'
const stageFormId = '40000000-0000-4000-8000-000000000007'
const activityId = '61000000-0000-4000-8000-000000000001'
const stageId = '62000000-0000-4000-8000-000000000001'
const anaId = '71000000-0000-4000-8000-000000000001'
const benId = '71000000-0000-4000-8000-000000000002'
const anaEnrollmentId = '81000000-0000-4000-8000-000000000001'
const benEnrollmentId = '81000000-0000-4000-8000-000000000002'
const createdAt = new Date('2026-10-03T00:00:00.000Z')
const rowId = (n: number) => `60000000-0000-4000-8000-00000000000${n}`
const [changedRow, scoreRow, missingRow, outsideRow, consentRow, identityRow, dateRow, foreignRow] =
  [1, 2, 3, 4, 5, 6, 7, 8].map(rowId)

const actor = (role: keyof typeof rolePermissions): ApplicationIdentity => ({
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic officer',
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [projectId],
})

const rule: FieldIntakeRule = {
  kind: 'TOTAL_SCORE',
  questions: [
    { field: 'q1', answers: ['A'] },
    { field: 'q2', answers: ['B'] },
    { field: 'q3', answers: ['C'] },
  ],
}
const field = (code: string, dataType: string, patch: Rec = {}) => ({
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
  field('q1', 'TEXT'),
  field('q2', 'TEXT'),
  field('q3', 'TEXT'),
  field('total_score', 'INTEGER', { rule }),
]
const mappedCodes = stageFields.map((item) => item.code).filter((code) => code !== 'middle_name')

const anaAnswers = {
  stage_date: '2026-03-10',
  stage_consent: true,
  external_identifier_value: '2024-001',
  first_name: 'Ana',
  middle_name: 'Santos',
  last_name: 'Cruz',
  q1: 'A',
  q2: 'B',
  q3: 'X',
  total_score: 2,
}
const benAnswers = {
  ...anaAnswers,
  external_identifier_value: '2024-002',
  first_name: 'Ben',
  middle_name: null,
  last_name: 'Reyes',
}

interface Store {
  rows: Rec[]
  batches: Rec[]
  mappings: Rec[]
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
let written: string[]
let ids = 0

// Every key of the filter must match, so a missing scope key fails the lookup like the database would.
const matches = (record: Rec, where: Rec): boolean =>
  Object.entries(where).every(([key, wanted]) => {
    const value = record[key]
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
      const op = wanted as Rec
      if ('in' in op) return (op.in as unknown[]).includes(value)
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
const wrote = <A extends unknown[], R>(name: string, work: (...args: A) => R) => {
  return (...args: A) => {
    written.push(name)
    return work(...args)
  }
}
// Reads the list on each call because a rolled-back request swaps the store.
const create = (list: keyof Store, prefix: string) => (arg: { data: Rec }) => {
  const record = { id: `${prefix}-${++ids}`, ...arg.data }
  ;(store[list] as Rec[]).push(record)
  return record
}

const fakeTx = {
  $queryRaw: async (query: { sql: string; values: unknown[] }) => {
    if (isRowCountsQuery(query)) {
      return fakeRowCounts(
        store.rows.filter((row) => row.importBatchId === query.values[0]) as never,
      )
    }
    const batch = find(store.batches, { id: query.values[0] })
    return batch && query.values.includes(organizationId) && query.values.includes(batch.projectId)
      ? [{ id: batch.id }]
      : []
  },
  project: {
    findFirst: async (args: { where: { AND: [Rec, { id: string }] } }) => {
      const [scope, wanted] = args.where.AND
      const allowed = (scope.id as { in: string[] } | undefined)?.in ?? [wanted.id]
      return wanted.id === projectId && allowed.includes(wanted.id) ? { id: wanted.id } : null
    },
  },
  dataImportBatch: {
    findFirst: async ({ where }: { where: Rec }) => find(store.batches, where),
    findUnique: async ({ where }: { where: Rec }) => find(store.batches, where),
    update: wrote('batch.update', async ({ where, data }: { where: Rec; data: Rec }) => {
      const batch = find(store.batches, where) as Rec
      if (data.status === 'PROCESSING' && data.processedAt !== null) {
        throw new Error('import_batches_state: PROCESSING requires processedAt null')
      }
      return apply(batch, data)
    }),
  },
  dataImportRow: {
    findFirst: async ({ where }: { where: Rec }) => structuredClone(find(store.rows, where)),
    findMany: async ({ where }: { where: Rec }) =>
      store.rows.filter((row) => matches(row, where)).map((row) => ({ rawData: row.rawData })),
    updateMany: wrote('row.updateMany', async ({ where, data }: { where: Rec; data: Rec }) => {
      const hit = store.rows.filter((row) => matches(row, where))
      for (const row of hit) apply(row, data)
      return { count: hit.length }
    }),
    update: wrote('row.update', async ({ where, data }: { where: Rec; data: Rec }) =>
      apply(find(store.rows, where) as Rec, data),
    ),
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
      where.organizationId === organizationId && where.formId === registrationFormId
        ? { importDefault: 'STUDENT_ID' }
        : null,
  },
  metadataMapping: {
    findMany: async ({ where }: { where: Rec }) =>
      store.mappings.filter((item) => matches(item, where)),
    findFirst: async ({ where }: { where: Rec }) => find(store.mappings, where),
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
    create: wrote('submission.create', (arg: { data: Rec }) =>
      create('submissions', 'sub')({ data: { ...arg.data, responses: [] } }),
    ),
    update: wrote('submission.update', async ({ where, data }: { where: Rec; data: Rec }) =>
      apply(find(store.submissions, where) as Rec, data),
    ),
  },
  formResponseValue: {
    createMany: wrote('response.createMany', async ({ data }: { data: Rec[] }) => {
      for (const item of data) {
        const submission = find(store.submissions, { id: item.submissionId }) as Rec
        const code = stageFields.find((candidate) => candidate.id === item.fieldId)?.code
        ;(submission.responses as Rec[]).push({ value: item.value, field: { code } })
      }
    }),
  },
  importValueRejection: {
    findMany: async ({ where }: { where: Rec }) =>
      store.rejections.filter(
        (item) =>
          item.organizationId === where.organizationId &&
          item.beneficiaryId === where.beneficiaryId &&
          ((where.fieldId as Rec).in as string[]).includes(item.fieldId as string) &&
          ((where.valueHash as Rec).in as string[]).includes(item.valueHash as string),
      ),
    createMany: wrote('rejection.createMany', async ({ data }: { data: Rec[] }) => {
      store.rejections.push(...data)
    }),
  },
  beneficiaryActivityParticipation: {
    findFirst: async ({ where }: { where: Rec }) => find(store.participations, where),
    create: wrote('participation.create', create('participations', 'part')),
  },
  beneficiaryJourneyEvent: {
    findFirst: async ({ where }: { where: Rec }) => find(store.events, where),
    create: wrote('event.create', create('events', 'event')),
  },
  assessmentResult: {
    findFirst: async ({ where }: { where: Rec }) =>
      store.assessments
        .filter((item) => matches(item, where))
        .sort(
          (a, b) =>
            Number(b.assessmentDate) - Number(a.assessmentDate) ||
            Number(b.recordedAt) - Number(a.recordedAt),
        )[0] ?? null,
    create: wrote('assessment.create', create('assessments', 'assess')),
  },
  auditLog: { create: wrote('audit.create', create('audits', 'audit')) },
}

const state = vi.hoisted(() => ({ actor: undefined as unknown }))

// Runs the work like the database transaction does: a thrown error undoes every write of the request.
vi.mock('../../common/authz/authorized-operation', async () => {
  const { ForbiddenException } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(
      async (_prisma, _identity, permission, work: (tx: unknown, who: unknown) => unknown) => {
        const who = state.actor as ApplicationIdentity
        if (!hasAtomicPermission(who.roles[0], who.permissions, permission)) {
          throw new ForbiddenException('Required application permission is missing.')
        }
        const before = structuredClone(store)
        try {
          return await work(fakeTx, who)
        } catch (error) {
          store = before
          throw error
        }
      },
    ),
  }
})

const registration = { readRegistrationForm: vi.fn(), promoteRegistration: vi.fn() }
const service = () =>
  new ImportReviewService(
    {} as PrismaService,
    registration as unknown as BeneficiaryRegistrationService,
  )
const review = (id: string) => service().review(state.actor as never, projectId, childId, id)
const resolve = (id: string, body: Rec = {}) =>
  service().resolve(state.actor as never, projectId, childId, id, {
    expectedValidationRevision: 1,
    saveAs: 'UPDATE',
    choices: {},
    own: {},
    ...body,
  } as never)

const row = (id: string, rowNumber: number, patch: Rec) => ({
  id,
  organizationId,
  projectId,
  importBatchId: childId,
  rowNumber,
  rawData: {},
  status: 'UNPROCESSED',
  mappingRevision: 1,
  validationRevision: 1,
  processingClaimId: null,
  processingClaimedAt: null,
  processingAttempts: 1,
  processingErrorCode: null,
  registrationOutcome: null,
  processedAt: null,
  normalizedData: null,
  validationErrors: [],
  resolutionData: null,
  resolvedById: null,
  resolvedAt: null,
  ...patch,
})
const held = (id: string, rowNumber: number, code: string, data: Rec) =>
  row(id, rowNumber, { processingErrorCode: code, normalizedData: data })
const parentRow = (rowNumber: number, identifier: string) => ({
  organizationId,
  importBatchId: parentId,
  rowNumber,
  status: 'PROCESSED',
  normalizedData: { external_identifier_type: 'STUDENT_ID', external_identifier_value: identifier },
})
const batchRecord = (id: string, patch: Rec) => ({
  id,
  organizationId,
  projectId,
  formId: registrationFormId,
  formVersion: 1,
  status: 'PARTIALLY_PROCESSED',
  mappingRevision: 1,
  validationRevision: 1,
  validatedMappingRevision: 1,
  processingRevision: 1,
  processingClaimId: null,
  processingClaimedAt: null,
  processedAt: createdAt,
  reviewedById: actorId,
  parentBatchId: null,
  partCode: null,
  createdAt,
  form: { code: 'registration', name: 'Registration', formType: 'BENEFICIARY_REGISTRATION' },
  ...patch,
})
const rawScoreRow = ['2026-03-10', 'true', '2024-002', 'Ben', 'Reyes', 'A', 'B', 'X', '3']

beforeEach(() => {
  ids = 0
  written = []
  vi.clearAllMocks()
  state.actor = actor('MONITORING_AND_EVALUATION_OFFICER')
  const scope = { organizationId, projectId }
  store = {
    rows: [
      held(changedRow, 1, 'STAGE_CHANGED', { ...anaAnswers, q3: 'Z' }),
      row(scoreRow, 2, {
        status: 'INVALID',
        rawData: Object.fromEntries(
          rawScoreRow.map((value, index) => [`column_000${index + 1}`, value]),
        ),
        validationErrors: [
          { fieldCode: 'total_score', code: 'TOTAL_SCORE_MISMATCH', message: 'x' },
        ],
      }),
      held(missingRow, 3, 'STAGE_DATE_MISSING', { ...benAnswers, stage_date: null }),
      held(outsideRow, 4, 'STAGE_DATE_OUTSIDE_ENROLLMENT', {
        ...benAnswers,
        stage_date: '2025-12-31',
      }),
      held(consentRow, 5, 'STAGE_CONSENT_MISSING', { ...benAnswers, stage_consent: false }),
      held(identityRow, 6, 'STAGE_IDENTITY_MISMATCH', { ...benAnswers, last_name: 'Santos' }),
      held(dateRow, 7, 'STAGE_CHANGED', { ...anaAnswers, stage_date: '2026-03-12' }),
      { ...held(foreignRow, 8, 'STAGE_CHANGED', anaAnswers), projectId: otherProjectId },
      parentRow(1, '2024-001'),
      ...[2, 3, 4, 5, 6].map((n) => parentRow(n, '2024-002')),
      parentRow(7, '2024-001'),
    ],
    batches: [
      batchRecord(parentId, {}),
      batchRecord(childId, {
        formId: stageFormId,
        parentBatchId: parentId,
        partCode: 'lst',
        form: { code: 'stage_lst', name: 'LST', formType: 'TRAINING_SURVEY' },
      }),
    ],
    mappings: [
      ...mappedCodes.map((code, index) => ({
        ...scope,
        importBatchId: childId,
        revision: 1,
        status: 'MAPPED',
        sourceFieldName: `column_000${index + 1}`,
        dataType: null,
        valueMap: null,
        dateOrder: null,
        targetField: { code, dataType: stageFields.find((item) => item.code === code)?.dataType },
      })),
    ],
    identifiers: [
      {
        organizationId,
        identifierType: 'STUDENT_ID',
        normalizedValue: '2024-001',
        beneficiaryId: anaId,
      },
      {
        organizationId,
        identifierType: 'STUDENT_ID',
        normalizedValue: '2024-002',
        beneficiaryId: benId,
      },
    ],
    beneficiaries: [
      {
        id: anaId,
        organizationId,
        archivedAt: null,
        displayName: 'Ana Cruz',
        firstName: 'Ana',
        middleName: 'Santos',
        lastName: 'Cruz',
        consentRecorded: true,
        dataProcessingConsentRecorded: true,
      },
      {
        id: benId,
        organizationId,
        archivedAt: null,
        displayName: 'Ben Reyes',
        firstName: 'Ben',
        middleName: null,
        lastName: 'Reyes',
        consentRecorded: true,
        dataProcessingConsentRecorded: true,
      },
    ],
    enrollments: [
      [anaEnrollmentId, anaId],
      [benEnrollmentId, benId],
    ].map(([id, beneficiaryId]) => ({
      id,
      ...scope,
      beneficiaryId,
      enrollmentDate: new Date('2026-01-01T00:00:00Z'),
      endedDate: null,
    })),
    // Ana took this stage before: one submission, the participation it started, its event and a score of 2.
    submissions: [
      {
        id: 'earlier',
        ...scope,
        beneficiaryId: anaId,
        status: 'VALIDATED',
        submittedAt: new Date('2026-03-11T00:00:00Z'),
        form: { code: 'stage_lst' },
        responses: Object.entries(anaAnswers).map(([code, value]) => ({ value, field: { code } })),
      },
    ],
    participations: [
      {
        id: 'part-old',
        ...scope,
        enrollmentId: anaEnrollmentId,
        activityId,
        participationDate: new Date('2026-03-10T00:00:00Z'),
        sourceSubmissionId: 'earlier',
      },
    ],
    events: [
      {
        id: 'event-old',
        ...scope,
        enrollmentId: anaEnrollmentId,
        activityId,
        stageId,
        participationId: 'part-old',
        eventType: 'PARTICIPATION',
        eventDate: new Date('2026-03-10T00:00:00Z'),
        correctsEventId: null,
      },
    ],
    assessments: [
      {
        id: 'assess-old',
        ...scope,
        enrollmentId: anaEnrollmentId,
        activityId,
        score: '2.0000',
        assessmentDate: new Date('2026-03-10T00:00:00Z'),
        recordedAt: new Date('2026-03-11T00:00:00Z'),
      },
    ],
    rejections: [],
    audits: [],
  }
})

const rowOf = (id: string) => find(store.rows, { id }) as Rec
const mine = (list: Rec[]) => list.filter((item) => !String(item.id).match(/earlier|old/))
// The two answers that earn the change of the first row: a better q3 and the score it gives.
const betterAnswer = { choices: { q3: 'OWN', total_score: 'CALCULATED' }, own: { q3: 'C' } }

describe('review of a held stage', () => {
  it('review shows PATHWAYS, file and your value for a changed answer', async () => {
    const result = await review(changedRow)
    const byCode = Object.fromEntries(result.fields.map((item) => [item.code, item]))

    expect(result).toMatchObject({
      rowId: changedRow,
      rowNumber: 1,
      reason: 'STAGE_CHANGED',
      participant: { beneficiaryId: anaId, clientId: '2024-001', displayName: 'Ana Cruz' },
      canAddNew: false,
    })
    expect(byCode.q3).toMatchObject({ pathways: 'X', file: 'Z', changed: true })
    expect(byCode.q1).toMatchObject({ pathways: 'A', file: 'A', changed: false })
    expect(registration.readRegistrationForm).not.toHaveBeenCalled()
    expect(written).toEqual([])
  })

  it('total score mismatch shows the calculated score and answers', async () => {
    const result = await review(scoreRow)
    const score = result.fields.find((item) => item.code === 'total_score')

    expect(result.reason).toBe('TOTAL_SCORE_MISMATCH')
    expect(score).toMatchObject({ file: 3, calculated: 2, changed: true, rule })
    expect(result.scoreDetail).toEqual([
      { code: 'q1', label: 'q1', answer: 'A', correct: ['A'], counted: true },
      { code: 'q2', label: 'q2', answer: 'B', correct: ['B'], counted: true },
      { code: 'q3', label: 'q3', answer: 'X', correct: ['C'], counted: false },
    ])
  })

  it('a stage without a total score rule shows no answers', async () => {
    const plain = stageFields.find((item) => item.code === 'total_score') as Rec
    plain.rule = null
    try {
      expect((await review(changedRow)).scoreDetail).toBeUndefined()
    } finally {
      plain.rule = rule
    }
  })

  it('a date hold marks the stage date as the field to settle', async () => {
    const result = await review(missingRow)
    expect(result.fields.find((item) => item.code === 'stage_date')?.changed).toBe(true)
    expect(result.fields.find((item) => item.code === 'q1')?.changed).toBe(false)
  })

  it('row from another project is 404', async () => {
    await expect(review(foreignRow)).rejects.toBeInstanceOf(NotFoundException)
    await expect(resolve(foreignRow)).rejects.toThrow('Import row unavailable.')
    expect(written).toEqual([])
  })
})

describe('resolving a held stage', () => {
  it('keeping PATHWAYS remembers the rejection', async () => {
    await expect(resolve(changedRow, { choices: { q3: 'PATHWAYS' } })).resolves.toEqual({
      status: 'PROCESSED',
    })

    expect(store.rejections).toEqual([
      expect.objectContaining({
        beneficiaryId: anaId,
        fieldId: 'f-q3',
        valueHash: valueHash('Z'),
        rejectedById: actorId,
      }),
    ])
    // PATHWAYS already holds these answers, so no second submission is added.
    expect(mine(store.submissions)).toHaveLength(0)
    expect(rowOf(changedRow)).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'UNCHANGED',
      resolvedById: actorId,
    })
  })

  it('own value saved as a new submission, earlier one kept', async () => {
    await expect(resolve(changedRow, betterAnswer)).resolves.toEqual({ status: 'PROCESSED' })

    expect(store.submissions).toHaveLength(2)
    expect(store.submissions[0]).toMatchObject({ id: 'earlier', status: 'VALIDATED' })
    expect(store.submissions[1]).toMatchObject({
      beneficiaryId: anaId,
      status: 'VALIDATED',
      importRowId: changedRow,
      source: 'IMPORTED_DATASET',
    })
    expect(store.submissions[1]).not.toHaveProperty('enrollmentId')
    expect(store.submissions[1].responses).toEqual(
      expect.arrayContaining([
        { value: 'C', field: { code: 'q3' } },
        { value: 3, field: { code: 'total_score' } },
      ]),
    )
    expect(rowOf(changedRow)).toMatchObject({
      status: 'PROCESSED',
      registrationOutcome: 'CREATED',
      processingClaimId: null,
      resolutionData: { saveAs: 'UPDATE', choices: betterAnswer.choices },
    })
    // The batch rests again with the rows nobody settled still waiting.
    expect(find(store.batches, { id: childId })).toMatchObject({
      status: 'PARTIALLY_PROCESSED',
      processingClaimId: null,
    })
    expect(store.rejections).toEqual([expect.objectContaining({ valueHash: valueHash('Z') })])
  })

  it('invalid own value keeps the row held', async () => {
    const attempt = resolve(changedRow, {
      choices: { q3: 'FILE', stage_date: 'OWN' },
      own: { stage_date: 'not a date' },
    })

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
    await expect(attempt).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ fieldCode: 'stage_date' })] },
    })
    expect(written).toEqual([])
    expect(rowOf(changedRow)).toMatchObject({ status: 'UNPROCESSED', resolvedAt: null })
  })

  it('second confirm conflicts', async () => {
    await resolve(changedRow, betterAnswer)

    await expect(resolve(changedRow, betterAnswer)).rejects.toBeInstanceOf(ConflictException)
    expect(store.submissions).toHaveLength(2)
    expect(store.assessments).toHaveLength(2)
  })

  it('corrected stage date writes a correction event', async () => {
    await resolve(dateRow, { choices: { stage_date: 'FILE' } })

    expect(store.events).toHaveLength(2)
    expect(store.events[0]).toMatchObject({ id: 'event-old', correctsEventId: null })
    expect(store.events[1]).toMatchObject({
      enrollmentId: anaEnrollmentId,
      activityId,
      stageId,
      participationId: 'part-old',
      eventType: 'PARTICIPATION',
      eventDate: new Date('2026-03-12T00:00:00Z'),
      correctsEventId: 'event-old',
      recordedById: actorId,
    })
    expect(String(store.events[1].correctionReason)).not.toBe('')
    // The participation keeps its first date, and the unchanged score adds no assessment.
    expect(store.participations).toEqual([
      expect.objectContaining({ participationDate: new Date('2026-03-10T00:00:00Z') }),
    ])
    expect(store.assessments).toHaveLength(1)
    expect(store.submissions).toHaveLength(2)
  })

  it('corrected score adds an assessment and keeps the earlier one', async () => {
    await resolve(changedRow, betterAnswer)

    expect(store.assessments).toHaveLength(2)
    expect(store.assessments[0]).toMatchObject({ id: 'assess-old', score: '2.0000' })
    expect(store.assessments[1]).toMatchObject({
      type: 'OTHER',
      score: 3,
      maximumScore: 3,
      enrollmentId: anaEnrollmentId,
      activityId,
      sourceSubmissionId: store.submissions[1].id,
    })
    expect(store.events).toHaveLength(1)
  })

  it('total score mismatch is resolved by the calculated score', async () => {
    await resolve(scoreRow, { choices: { total_score: 'CALCULATED' } })

    expect(rowOf(scoreRow)).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
    expect(store.assessments[1]).toMatchObject({ score: 2, enrollmentId: benEnrollmentId })
    // Ben had no stage before, so the first one starts his participation.
    expect(store.participations.at(-1)).toMatchObject({ enrollmentId: benEnrollmentId })
    expect(store.events.at(-1)).toMatchObject({ enrollmentId: benEnrollmentId, stageId })
  })

  it('total score mismatch kept as the file has it stays invalid', async () => {
    await expect(resolve(scoreRow, { choices: { total_score: 'FILE' } })).rejects.toMatchObject({
      response: { errors: [expect.objectContaining({ code: 'TOTAL_SCORE_MISMATCH' })] },
    })
    expect(written).toEqual([])
  })

  it('own date saves a row held for a missing date', async () => {
    await resolve(missingRow, { choices: { stage_date: 'OWN' }, own: { stage_date: '2026-03-05' } })

    expect(rowOf(missingRow)).toMatchObject({ status: 'PROCESSED', registrationOutcome: 'CREATED' })
    expect(store.participations.at(-1)).toMatchObject({
      participationDate: new Date('2026-03-05T00:00:00Z'),
    })
    expect(store.events).toHaveLength(2)
    expect(store.events.at(-1)).not.toHaveProperty('correctsEventId')
  })

  it('date outside the enrollment keeps the row held', async () => {
    await expect(
      resolve(outsideRow, { choices: { stage_date: 'OWN' }, own: { stage_date: '2025-12-30' } }),
    ).rejects.toMatchObject({
      response: {
        code: 'STAGE_DATE_OUTSIDE_ENROLLMENT',
        message: expect.stringContaining('Row 4 still needs review'),
      },
    })

    expect(rowOf(outsideRow)).toMatchObject({
      status: 'UNPROCESSED',
      processingErrorCode: 'STAGE_DATE_OUTSIDE_ENROLLMENT',
      resolvedAt: null,
      resolutionData: null,
    })
    expect(store.submissions).toHaveLength(1)
    expect(store.audits).toEqual([])
  })

  it.each([
    ['STAGE_CONSENT_MISSING', consentRow, 5],
    ['STAGE_IDENTITY_MISMATCH', identityRow, 6],
  ])('%s stays held and a resolve is refused', async (code, id, rowNumber) => {
    await expect(resolve(id)).rejects.toMatchObject({
      response: {
        code,
        message: expect.stringContaining(`Row ${rowNumber} still needs review`),
      },
    })
    await expect(resolve(id)).rejects.toBeInstanceOf(ConflictException)

    // Refused before the batch or the row is claimed.
    expect(written).toEqual([])
    expect(rowOf(id)).toMatchObject({
      status: 'UNPROCESSED',
      processingErrorCode: code,
      resolvedAt: null,
    })
  })

  it('saving as new is refused on a stage', async () => {
    await expect(
      resolve(changedRow, { saveAs: 'NEW', choices: { q3: 'FILE' } }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(written).toEqual([])
    expect(rowOf(changedRow)).toMatchObject({ status: 'UNPROCESSED', resolvedAt: null })
  })

  it('project officer cannot resolve a stage (403)', async () => {
    state.actor = actor('PROJECT_OFFICER')

    await expect(resolve(changedRow, { choices: { q3: 'FILE' } })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(written).toEqual([])
    expect(rowOf(changedRow)).toMatchObject({ status: 'UNPROCESSED', resolvedAt: null })
  })

  it('an officer who cannot record participation is refused before any write', async () => {
    const limited = actor('MONITORING_AND_EVALUATION_OFFICER')
    state.actor = {
      ...limited,
      permissions: limited.permissions.filter((item) => item !== 'assessments.record'),
    }

    await expect(resolve(changedRow, betterAnswer)).rejects.toThrow('Importing surveys needs')
    expect(written).toEqual([])
  })

  it('audit has choices and no values', async () => {
    await resolve(changedRow, {
      choices: { q3: 'OWN', total_score: 'CALCULATED' },
      own: { q3: 'Secret answer' },
    })

    const resolved = store.audits.filter((item) => item.action === 'IMPORT_ROW_RESOLVED')
    expect(resolved).toEqual([
      expect.objectContaining({
        projectId,
        entityType: 'DataImportRow',
        entityId: changedRow,
        changes: {
          rowNumber: 1,
          reason: 'STAGE_CHANGED',
          saveAs: 'UPDATE',
          choices: { q3: 'OWN', total_score: 'CALCULATED' },
        },
      }),
    ])
    expect(store.audits.map((item) => item.action)).toContain('IMPORT_STAGE_ROW_COMMITTED')
    expect(JSON.stringify(store.audits)).not.toMatch(
      /Ana|Cruz|Santos|2024-001|2026-03|Secret answer/,
    )
  })
})
