import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { DIRECT_ENTRY_FORM_TYPES, rolePermissions } from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Tx | undefined,
}))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const authorId = '20000000-0000-4000-8000-000000000002'
const reviewerId = '20000000-0000-4000-8000-000000000003'
const projectId = '30000000-0000-4000-8000-000000000003'
const foreignProjectId = '30000000-0000-4000-8000-000000000004'
const formId = '40000000-0000-4000-8000-000000000004'
const fieldId = '50000000-0000-4000-8000-000000000005'
const submissionId = '60000000-0000-4000-8000-000000000006'
const clientSubmissionId = '70000000-0000-4000-8000-000000000007'
const now = new Date('2026-09-13T00:00:00.000Z')

const actor = (
  role = 'MONITORING_AND_EVALUATION_OFFICER',
  userId = reviewerId,
): ApplicationIdentity => ({
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions: ['forms.read', 'forms.manage', 'forms.publish', 'submissions.write'],
  assignedProjectIds: [projectId],
})

const field = {
  id: fieldId,
  code: 'score',
  label: 'Score',
  dataType: 'DECIMAL' as const,
  isRequired: true,
  isMetadataKey: false,
  isSadddField: false,
  allowedValues: null,
  minimumValue: new Prisma.Decimal(0),
  maximumValue: new Prisma.Decimal(100),
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sourceNames: [] as string[],
  valueAliases: null,
  importDefault: null,
  rule: null,
  sequenceNo: 1,
}

const form = (patch: Record<string, unknown> = {}) => ({
  id: formId,
  projectId,
  code: 'monitoring',
  version: 1,
  name: 'Monitoring',
  description: null,
  formType: 'OUTCOME_MONITORING' as const,
  status: 'DRAFT' as const,
  activityId: null,
  journeyStageId: null,
  createdById: authorId,
  lastEditedById: authorId,
  publishedAt: null,
  archivedAt: null,
  updatedAt: now,
  formField_form: [field],
  ...patch,
})

describe('P02 metadata service', () => {
  const tx = {
    $queryRaw: vi.fn(),
    project: { findFirst: vi.fn() },
    projectActivity: { findFirst: vi.fn() },
    journeyStage: { findFirst: vi.fn() },
    activityJourneyStageMapping: { findFirst: vi.fn() },
    digitalForm: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    formField: { createMany: vi.fn(), deleteMany: vi.fn() },
    formSubmission: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    formResponseValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const service = new MetadataService(
    {} as PrismaService,
    {
      promoteParticipation: vi.fn(),
    } as never,
  )

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor()
    state.tx = tx as unknown as Tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.digitalForm.findFirst.mockResolvedValue(form())
    tx.digitalForm.updateMany.mockResolvedValue({ count: 1 })
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it('keeps Grant Manager and Program Manager outside raw direct-entry permission', () => {
    expect(rolePermissions.GRANT_MANAGER).not.toContain('forms.read')
    expect(rolePermissions.GRANT_MANAGER).not.toContain('submissions.write')
    expect(rolePermissions.PROGRAM_MANAGER).not.toContain('forms.read')
    expect(rolePermissions.PROGRAM_MANAGER).not.toContain('submissions.write')
  })

  it('scopes form lookup by actor organization and assigned project before reading form data', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.getForm(state.actor as ApplicationIdentity, foreignProjectId, formId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    )
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
  })

  it('allows an authorized Admin reviewer to publish through forms.publish', async () => {
    state.actor = actor('SYSTEM_ADMINISTRATOR')
    await service.publishForm(state.actor, projectId, formId, {
      expectedUpdatedAt: now.toISOString(),
    })
    expect(tx.digitalForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED', publishedById: reviewerId }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalled()
  })

  it('denies self-approval before publication mutation or audit', async () => {
    state.actor = actor('MONITORING_AND_EVALUATION_OFFICER', authorId)
    await expect(
      service.publishForm(state.actor, projectId, formId, { expectedUpdatedAt: now.toISOString() }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies the author publishing own form in any publish role, and a role without forms.publish', async () => {
    for (const role of ['SYSTEM_ADMINISTRATOR', 'PROJECT_OFFICER']) {
      state.actor = actor(role, authorId)
      await expect(
        service.publishForm(state.actor, projectId, formId, {
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses to publish an incompatible Beneficiary registration definition', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({
        formType: 'BENEFICIARY_REGISTRATION',
        formField_form: [
          {
            ...field,
            code: 'enrollment_date',
            label: 'Enrollment date',
            dataType: 'DECIMAL',
          },
        ],
      }),
    )

    await expect(
      service.publishForm(state.actor as ApplicationIdentity, projectId, formId, {
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Form definition is invalid.',
        errors: expect.arrayContaining([
          expect.objectContaining({ fieldCode: 'enrollment_date', code: 'invalid_definition' }),
        ]),
      }),
    })
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses to publish activity monitoring without its canonical fields and activity-stage binding', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({
        formType: 'ACTIVITY_MONITORING',
        activityId: '30000000-0000-4000-8000-000000000005',
        journeyStageId: '30000000-0000-4000-8000-000000000006',
        formField_form: [field],
      }),
    )
    tx.activityJourneyStageMapping.findFirst.mockResolvedValue(null)

    await expect(
      service.publishForm(state.actor as ApplicationIdentity, projectId, formId, {
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Form definition is invalid.',
        errors: expect.arrayContaining([
          expect.objectContaining({ fieldCode: 'beneficiary_code' }),
          expect.objectContaining({ fieldCode: 'participation_date' }),
          expect.objectContaining({ fieldCode: 'journey_stage_id' }),
        ]),
      }),
    })
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
  })

  it('publishes with optimistic concurrency and an attributable audit event', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(form())
      .mockResolvedValueOnce(form({ status: 'PUBLISHED', publishedAt: now }))
    const result = await service.publishForm(
      state.actor as ApplicationIdentity,
      projectId,
      formId,
      {
        expectedUpdatedAt: now.toISOString(),
      },
    )
    expect(result.status).toBe('PUBLISHED')
    expect(tx.digitalForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          projectId,
          status: 'DRAFT',
          updatedAt: now,
        }),
        data: expect.objectContaining({ status: 'PUBLISHED', publishedById: reviewerId }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'FORM_PUBLISHED', actorUserId: reviewerId }),
      }),
    )
  })

  it('fails a stale concurrent publication without writing an audit event', async () => {
    tx.digitalForm.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.publishForm(state.actor as ApplicationIdentity, projectId, formId, {
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  describe('form intake metadata', () => {
    const request = (fields: Array<Record<string, unknown>>) => ({
      code: 'monitoring',
      name: 'Monitoring',
      formType: 'OUTCOME_MONITORING',
      fields: fields.map((item) => ({
        label: 'Field',
        required: false,
        metadataKey: false,
        sadddField: false,
        ...item,
      })),
    })
    const update = async (fields: Array<Record<string, unknown>>) =>
      service.updateForm(state.actor as ApplicationIdentity, projectId, formId, {
        ...request(fields),
        expectedUpdatedAt: now.toISOString(),
      } as never)
    const intakeFields = [
      {
        code: 'status',
        dataType: 'SELECT',
        allowedValues: ['Yes', 'No'],
        sourceNames: ['Current status'],
        valueAliases: [{ from: 'Y', to: 'Yes' }],
        importDefault: 'No',
      },
      { code: 'birth_date', dataType: 'DATE' },
      { code: 'visit_date', dataType: 'DATE' },
      {
        code: 'age',
        dataType: 'INTEGER',
        rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'visit_date' },
      },
    ]

    it('create and read round-trip sourceNames, valueAliases, importDefault and rule', async () => {
      tx.digitalForm.findFirst.mockResolvedValueOnce(null)
      tx.digitalForm.create.mockResolvedValue({ id: formId })
      await service.createForm(
        state.actor as ApplicationIdentity,
        projectId,
        request(intakeFields) as never,
      )
      const stored = tx.formField.createMany.mock.calls[0][0].data
      expect(stored[0]).toMatchObject({
        sourceNames: ['Current status'],
        valueAliases: [{ from: 'Y', to: 'Yes' }],
        importDefault: 'No',
        rule: Prisma.DbNull,
      })
      expect(stored[1]).toMatchObject({
        sourceNames: [],
        valueAliases: Prisma.DbNull,
        importDefault: null,
        rule: Prisma.DbNull,
      })
      expect(stored[3].rule).toEqual(intakeFields[3].rule)
      expect(tx.digitalForm.create.mock.calls[0][0].data.lastEditedById).toBe(reviewerId)

      tx.$queryRaw.mockResolvedValue([{ status: 'DRAFT', fingerprint: null }])
      tx.digitalForm.findFirst.mockResolvedValue(
        form({
          formField_form: stored.map((row: Record<string, unknown>, index: number) => ({
            ...field,
            ...row,
            valueAliases: row.valueAliases === Prisma.DbNull ? null : row.valueAliases,
            rule: row.rule === Prisma.DbNull ? null : row.rule,
            id: `50000000-0000-4000-8000-00000000050${index}`,
            sequenceNo: index + 1,
          })),
        }),
      )
      const read = await service.getForm(state.actor as ApplicationIdentity, projectId, formId)
      expect(read.fields[0]).toMatchObject({
        sourceNames: ['Current status'],
        valueAliases: [{ from: 'Y', to: 'Yes' }],
        importDefault: 'No',
      })
      expect(read.fields[1].sourceNames).toEqual([])
      expect(read.fields[3].rule).toEqual(intakeFields[3].rule)
    })

    it('update rejects importDefault on consent_recorded', async () => {
      await expect(
        update([{ code: 'consent_recorded', dataType: 'BOOLEAN', importDefault: 'true' }]),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'Form intake metadata is invalid.',
          errors: [expect.objectContaining({ fieldCode: 'consent_recorded' })],
        }),
      })
      expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
      expect(tx.formField.createMany).not.toHaveBeenCalled()
    })

    it('rejects duplicate source names across fields, on the matcher key', async () => {
      await expect(
        update([
          { code: 'first_name', dataType: 'TEXT', sourceNames: ['Given Name'] },
          { code: 'nickname', dataType: 'TEXT', sourceNames: ['given-name!'] },
        ]),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errors: [
            expect.objectContaining({ fieldCode: 'nickname', code: 'DUPLICATE_SOURCE_NAME' }),
          ],
        }),
      })
      expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    })

    it('allows the same source name twice inside one field', async () => {
      await update([
        { code: 'first_name', dataType: 'TEXT', sourceNames: ['Given Name', 'given_name'] },
      ])
      expect(tx.formField.createMany).toHaveBeenCalled()
    })

    it('records the editor of a draft update as the last editor', async () => {
      await update([{ code: 'score', dataType: 'DECIMAL' }])
      expect(tx.digitalForm.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastEditedById: reviewerId }),
        }),
      )
    })

    it('rejects a source name with no letter or digit, naming the field only', async () => {
      await expect(
        update([{ code: 'first_name', dataType: 'TEXT', sourceNames: ['!!!'] }]),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errors: [
            {
              fieldCode: 'first_name',
              code: 'invalid_definition',
              message: 'A source name must contain a letter or digit.',
            },
          ],
        }),
      })
      expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    })

    it('marks the form as own for the last editor who is not the creator', async () => {
      tx.$queryRaw.mockResolvedValue([{ status: 'DRAFT', fingerprint: null }])
      tx.digitalForm.findFirst.mockResolvedValue(form({ lastEditedById: reviewerId }))
      const read = await service.getForm(state.actor as ApplicationIdentity, projectId, formId)
      expect(read.createdByCurrentUser).toBe(true)
      tx.digitalForm.findFirst.mockResolvedValue(
        form({ lastEditedById: '20000000-0000-4000-8000-000000000009' }),
      )
      const other = await service.getForm(state.actor as ApplicationIdentity, projectId, formId)
      expect(other.createdByCurrentUser).toBe(false)
    })

    it('a new version copies the intake properties and records the actor as last editor', async () => {
      const source = form({
        status: 'PUBLISHED',
        formField_form: [
          {
            ...field,
            dataType: 'SELECT',
            allowedValues: ['Yes', 'No'],
            sourceNames: ['Current status'],
            valueAliases: [{ from: 'Y', to: 'Yes' }],
            importDefault: 'No',
            rule: { kind: 'SAME_ANSWER_AS', field: 'other' },
          },
        ],
      })
      tx.digitalForm.findFirst
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({ id: formId, version: 1, status: 'PUBLISHED' })
        .mockResolvedValueOnce(form({ version: 2 }))
      tx.digitalForm.create.mockResolvedValue({ id: '40000000-0000-4000-8000-000000000044' })
      await service.newVersion(state.actor as ApplicationIdentity, projectId, formId)
      expect(tx.digitalForm.create.mock.calls[0][0].data).toMatchObject({
        version: 2,
        createdById: reviewerId,
        lastEditedById: reviewerId,
      })
      expect(tx.formField.createMany.mock.calls[0][0].data[0]).toMatchObject({
        sourceNames: ['Current status'],
        valueAliases: [{ from: 'Y', to: 'Yes' }],
        importDefault: 'No',
        rule: { kind: 'SAME_ANSWER_AS', field: 'other' },
      })
    })

    it('publish is refused for the last editor', async () => {
      tx.digitalForm.findFirst.mockResolvedValue(form({ lastEditedById: reviewerId }))
      await expect(
        service.publishForm(state.actor as ApplicationIdentity, projectId, formId, {
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'A form author cannot approve and publish the same version.',
      })
      expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    })

    describe('confirming a needs-check field', () => {
      const summary = {
        addedFields: [],
        sourceNamesAdded: ['score'],
        optionsAdded: [],
        aliasesAdded: 0,
        defaults: [],
        rules: [],
        needsCheck: [
          { fieldCode: 'score', reason: 'SUGGESTED_SOURCE_NAME' },
          { fieldCode: 'score', reason: 'RULE_PROPOSED' },
          { fieldCode: 'sex', reason: 'ENUM_ANSWER_UNRESOLVED' },
        ],
      }
      const confirm = (fieldCode = 'score') =>
        service.confirmCheck(state.actor as ApplicationIdentity, projectId, formId, {
          expectedUpdatedAt: now.toISOString(),
          fieldCode,
        })

      it('removes every item of the field without making the actor the last editor', async () => {
        tx.digitalForm.findFirst.mockResolvedValue(form({ importDraftSummary: summary }))
        await confirm()
        expect(tx.digitalForm.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ status: 'DRAFT', updatedAt: now }),
          data: {
            importDraftSummary: {
              ...summary,
              needsCheck: [{ fieldCode: 'sex', reason: 'ENUM_ANSWER_UNRESOLVED' }],
            },
          },
        })
        expect(tx.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'FORM_DRAFT_CHECK_CONFIRMED',
              actorUserId: reviewerId,
            }),
          }),
        )
      })

      it.each([
        ['a field with nothing to confirm', form({ importDraftSummary: summary }), 'other'],
        ['a draft with no summary', form({ importDraftSummary: null }), 'score'],
        ['a published form', form({ status: 'PUBLISHED', importDraftSummary: summary }), 'score'],
      ])('refuses %s before any write', async (_name, stored, fieldCode) => {
        tx.digitalForm.findFirst.mockResolvedValue(stored)
        await expect(confirm(fieldCode)).rejects.toBeInstanceOf(ConflictException)
        expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
        expect(tx.auditLog.create).not.toHaveBeenCalled()
      })

      it('refuses a stale form without an audit event', async () => {
        tx.digitalForm.findFirst.mockResolvedValue(form({ importDraftSummary: summary }))
        tx.digitalForm.updateMany.mockResolvedValue({ count: 0 })
        await expect(confirm()).rejects.toBeInstanceOf(ConflictException)
        expect(tx.auditLog.create).not.toHaveBeenCalled()
      })
    })

    it('publish is allowed for a third user', async () => {
      tx.digitalForm.findFirst.mockResolvedValue(form({ lastEditedById: authorId }))
      state.actor = actor(
        'MONITORING_AND_EVALUATION_OFFICER',
        '20000000-0000-4000-8000-000000000009',
      )
      await service.publishForm(state.actor, projectId, formId, {
        expectedUpdatedAt: now.toISOString(),
      })
      expect(tx.digitalForm.updateMany).toHaveBeenCalled()
    })
  })

  it('rejects invalid or unknown direct-entry fields before persistence', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({ status: 'PUBLISHED', formType: 'ACTIVITY_MONITORING' }),
    )
    await expect(
      service.saveSubmission(state.actor as ApplicationIdentity, projectId, formId, {
        clientSubmissionId,
        values: { unknown_field: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })

  it('lists only bounded actor-owned direct submissions and distinguishes final records', async () => {
    tx.formSubmission.count.mockResolvedValue(2)
    tx.formSubmission.findMany.mockResolvedValue([
      {
        id: submissionId,
        status: 'DRAFT',
        formVersion: 1,
        submittedAt: null,
        updatedAt: now,
        values: { score: 'sensitive value must not leave this query' },
      },
      {
        id: '60000000-0000-4000-8000-000000000007',
        status: 'VALIDATED',
        formVersion: 1,
        submittedAt: now,
        updatedAt: now,
      },
    ])

    const result = await service.listSubmissions(
      state.actor as ApplicationIdentity,
      projectId,
      formId,
      { offset: 20, limit: 50 },
    )

    expect(tx.formSubmission.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        projectId,
        formId,
        formVersion: 1,
        submittedById: reviewerId,
        source: 'DIRECT_ENCODING',
      },
    })
    expect(tx.formSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 50,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          formVersion: true,
          submittedAt: true,
          updatedAt: true,
        },
      }),
    )
    expect(result).toEqual({
      offset: 20,
      limit: 50,
      total: 2,
      items: [
        {
          id: submissionId,
          status: 'DRAFT',
          formVersion: 1,
          submittedAt: undefined,
          updatedAt: now.toISOString(),
        },
        {
          id: '60000000-0000-4000-8000-000000000007',
          status: 'VALIDATED',
          formVersion: 1,
          submittedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
    })
    expect(result.items[0]).not.toHaveProperty('values')
    expect(result.items[0]).not.toHaveProperty('clientSubmissionId')
  })

  it('denies a cross-project submission listing before reading submission metadata', async () => {
    tx.project.findFirst.mockResolvedValue(null)

    await expect(
      service.listSubmissions(state.actor as ApplicationIdentity, foreignProjectId, formId, {
        offset: 0,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.formSubmission.count).not.toHaveBeenCalled()
    expect(tx.formSubmission.findMany).not.toHaveBeenCalled()
  })

  it('reloads one actor-owned persisted submission with its real responses', async () => {
    tx.formSubmission.findFirst.mockResolvedValue({
      id: submissionId,
      clientSubmissionId,
      status: 'DRAFT',
      formVersion: 1,
      submittedAt: null,
      updatedAt: now,
      formResponseValue_submission: [{ fieldId, value: '42' }],
    })

    const result = await service.getSubmission(
      state.actor as ApplicationIdentity,
      projectId,
      formId,
      submissionId,
    )

    expect(tx.formSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: submissionId,
          organizationId,
          projectId,
          formId,
          formVersion: 1,
          submittedById: reviewerId,
          source: 'DIRECT_ENCODING',
        },
      }),
    )
    expect(result).toMatchObject({
      id: submissionId,
      status: 'DRAFT',
      values: { score: '42' },
    })
  })

  it('returns a repeat retry-safe submission when its form version and normalized values match', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({ status: 'PUBLISHED', formType: 'ACTIVITY_MONITORING' }),
    )
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({
        id: submissionId,
        projectId,
        formId,
        formVersion: 1,
        beneficiaryId: null,
      })
      .mockResolvedValueOnce({
        id: submissionId,
        clientSubmissionId,
        status: 'DRAFT',
        formVersion: 1,
        submittedAt: null,
        updatedAt: now,
        formResponseValue_submission: [{ fieldId, value: '5' }],
      })
    const result = await service.saveSubmission(
      state.actor as ApplicationIdentity,
      projectId,
      formId,
      {
        clientSubmissionId,
        values: { score: '5.0000' },
      },
    )
    expect(result).toMatchObject({ id: submissionId, formVersion: 1, values: { score: '5' } })
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })

  it('rejects reuse of a submission identifier with different normalized values', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({ status: 'PUBLISHED', formType: 'ACTIVITY_MONITORING' }),
    )
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({
        id: submissionId,
        projectId,
        formId,
        formVersion: 1,
        beneficiaryId: null,
      })
      .mockResolvedValueOnce({
        id: submissionId,
        clientSubmissionId,
        status: 'DRAFT',
        formVersion: 1,
        submittedAt: null,
        updatedAt: now,
        formResponseValue_submission: [{ fieldId, value: '5' }],
      })
    await expect(
      service.saveSubmission(state.actor as ApplicationIdentity, projectId, formId, {
        clientSubmissionId,
        values: { score: '6' },
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it.each(['OUTCOME_MONITORING', 'OTHER'] as const)(
    'refuses direct entry for retired generic %s forms',
    async (formType) => {
      tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED', formType }))
      const retired = 'Encode Project Data is retired; import this form instead.'
      await expect(
        service.saveSubmission(state.actor as ApplicationIdentity, projectId, formId, {
          clientSubmissionId,
          values: { score: '5' },
        }),
      ).rejects.toThrow(retired)
      await expect(
        service.validateValues(state.actor as ApplicationIdentity, projectId, formId, {
          score: '5',
        }),
      ).rejects.toThrow(retired)
      expect(tx.formSubmission.create).not.toHaveBeenCalled()
    },
  )

  it.each(['OUTCOME_MONITORING', 'OTHER'] as const)(
    'refuses update, validate and submit for retired %s forms before any write',
    async (formType) => {
      tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED', formType }))
      const retired = 'Encode Project Data is retired; import this form instead.'
      const actor = state.actor as ApplicationIdentity
      await expect(
        service.updateSubmission(actor, projectId, formId, submissionId, {
          values: { score: '5' },
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toThrow(retired)
      await expect(
        service.validateSubmission(actor, projectId, formId, submissionId),
      ).rejects.toThrow(retired)
      await expect(
        service.submitSubmission(actor, projectId, formId, submissionId, {
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toThrow(retired)
      expect(tx.formSubmission.updateMany).not.toHaveBeenCalled()
    },
  )

  it.each(DIRECT_ENTRY_FORM_TYPES)('saves a %s submission directly', async (formType) => {
    tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED', formType }))
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({
        id: submissionId,
        projectId,
        formId,
        formVersion: 1,
        beneficiaryId: null,
      })
      .mockResolvedValueOnce({
        id: submissionId,
        clientSubmissionId,
        status: 'DRAFT',
        formVersion: 1,
        submittedAt: null,
        updatedAt: now,
        formResponseValue_submission: [{ fieldId, value: '5' }],
      })
    await expect(
      service.saveSubmission(state.actor as ApplicationIdentity, projectId, formId, {
        clientSubmissionId,
        values: { score: '5' },
      }),
    ).resolves.toMatchObject({ id: submissionId, values: { score: '5' } })
  })

  it('keeps direct entry for training surveys', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      form({ status: 'PUBLISHED', formType: 'TRAINING_SURVEY' }),
    )
    await expect(
      service.validateValues(state.actor as ApplicationIdentity, projectId, formId, {
        score: '5',
      }),
    ).resolves.toBeDefined()
  })
})
