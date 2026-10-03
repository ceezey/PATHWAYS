import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission, rolePermissions } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({
  actor: undefined as unknown as ApplicationIdentity,
  permissions: [] as string[],
}))

vi.mock('../auth/authorized-operation', async () => {
  const { ForbiddenException: Forbidden } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work) => {
      state.permissions.push(permission)
      if (!state.actor.permissions.includes(permission)) {
        throw new Forbidden('Required application permission is missing.')
      }
      return work(tx, state.actor)
    }),
  }
})

const organizationId = '10000000-0000-4000-8000-000000000001'
const authorId = '20000000-0000-4000-8000-000000000002'
const reviewerId = '20000000-0000-4000-8000-000000000003'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const fieldId = '50000000-0000-4000-8000-000000000005'
const submissionId = '60000000-0000-4000-8000-000000000006'
const clientSubmissionId = '70000000-0000-4000-8000-000000000007'
const now = new Date('2026-09-13T00:00:00.000Z')

const actor = (patch: Partial<ApplicationIdentity> = {}): ApplicationIdentity => ({
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId: reviewerId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['forms.read', 'forms.manage', 'forms.publish', 'submissions.write'],
  assignedProjectIds: [projectId],
  ...patch,
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
  sequenceNo: 1,
}

const form = (patch: Record<string, unknown> = {}) => ({
  id: formId,
  projectId,
  code: 'survey',
  version: 1,
  name: 'Survey',
  description: null,
  formType: 'TRAINING_SURVEY' as const,
  status: 'PUBLISHED' as const,
  activityId: null,
  journeyStageId: null,
  createdById: authorId,
  publishedAt: now,
  archivedAt: null,
  updatedAt: now,
  formField_form: [field],
  ...patch,
})

const submissionRow = (patch: Record<string, unknown> = {}) => ({
  id: submissionId,
  clientSubmissionId,
  beneficiaryId: null,
  status: 'DRAFT',
  formVersion: 1,
  submittedAt: null,
  updatedAt: now,
  formResponseValue_submission: [{ fieldId, value: '5' }],
  ...patch,
})

const tx = {
  project: { findFirst: vi.fn() },
  digitalForm: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  formSubmission: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  formResponseValue: { deleteMany: vi.fn(), createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}

describe('PRD-F5 gates', () => {
  const service = new MetadataService(
    {} as PrismaService,
    { promoteParticipation: vi.fn() } as never,
  )
  const identity = () => state.actor

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor()
    state.permissions = []
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.digitalForm.findFirst.mockResolvedValue(form())
    tx.digitalForm.updateMany.mockResolvedValue({ count: 1 })
    tx.formSubmission.updateMany.mockResolvedValue({ count: 1 })
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it('G-F5-2 creates a new direct entry linked to the project and form, then submit validates it with an audit row', async () => {
    tx.formSubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        submissionRow({ formResponseValue_submission: [{ fieldId, value: '5' }] }),
      )
    tx.formSubmission.create.mockResolvedValue({ id: submissionId })
    const saved = await service.saveSubmission(identity(), projectId, formId, {
      clientSubmissionId,
      values: { score: '5' },
    })

    expect(tx.formSubmission.create).toHaveBeenCalledOnce()
    expect(tx.formSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId,
          projectId,
          formId,
          formVersion: 1,
          clientSubmissionId,
          source: 'DIRECT_ENCODING',
          status: 'DRAFT',
        }),
      }),
    )
    expect(saved).toMatchObject({ id: submissionId, status: 'DRAFT', values: { score: '5' } })

    vi.clearAllMocks()
    tx.formSubmission.findFirst
      .mockResolvedValueOnce(submissionRow())
      .mockResolvedValueOnce(submissionRow({ status: 'VALIDATED', submittedAt: now }))
    tx.formSubmission.updateMany.mockResolvedValue({ count: 1 })
    const submitted = await service.submitSubmission(identity(), projectId, formId, submissionId, {
      expectedUpdatedAt: now.toISOString(),
    })

    expect(submitted.status).toBe('VALIDATED')
    expect(tx.formSubmission.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: submissionId,
        organizationId,
        status: 'DRAFT',
        updatedAt: now,
      }),
      data: expect.objectContaining({ status: 'VALIDATED', validatedById: reviewerId }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        actorUserId: reviewerId,
        projectId,
        action: 'FORM_SUBMISSION_VALIDATED',
        entityType: 'FormSubmission',
        entityId: submissionId,
        changes: { formId, formVersion: 1, fieldCount: 1 },
      }),
    })
  })

  it('G-F5-2 rejects invalid values with field-level messages before persistence', async () => {
    const attempt = service.saveSubmission(identity(), projectId, formId, {
      clientSubmissionId,
      values: { score: 'not-a-number' },
    })
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
    await attempt.catch((caught: BadRequestException) => {
      expect(caught.getResponse()).toMatchObject({
        message: 'Form responses are invalid.',
        errors: [
          expect.objectContaining({
            fieldCode: 'score',
            message: expect.stringContaining('Score'),
          }),
        ],
      })
    })
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('G-F5-3 updates a draft with the new values under expectedUpdatedAt concurrency', async () => {
    tx.formSubmission.findFirst
      .mockResolvedValueOnce(submissionRow())
      .mockResolvedValueOnce(
        submissionRow({ formResponseValue_submission: [{ fieldId, value: '9' }] }),
      )
    const result = await service.updateSubmission(identity(), projectId, formId, submissionId, {
      values: { score: '9' },
      expectedUpdatedAt: now.toISOString(),
    })

    expect(tx.formSubmission.updateMany).toHaveBeenCalledWith({
      where: {
        id: submissionId,
        organizationId,
        submittedById: reviewerId,
        status: 'DRAFT',
        updatedAt: now,
      },
      data: { updatedAt: expect.any(Date) },
    })
    expect(tx.formResponseValue.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ submissionId, fieldId, value: '9' })],
    })
    expect(result.values).toEqual({ score: '9' })
  })

  it.each(['DRAFT', 'ARCHIVED'] as const)(
    'G-F5-3 update, validate and submit refuse a draft on a %s form before any submission write',
    async (status) => {
      tx.digitalForm.findFirst.mockResolvedValue(form({ status }))
      await expect(
        service.updateSubmission(identity(), projectId, formId, submissionId, {
          values: { score: '9' },
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        service.validateSubmission(identity(), projectId, formId, submissionId),
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        service.submitSubmission(identity(), projectId, formId, submissionId, {
          expectedUpdatedAt: now.toISOString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException)

      expect(tx.formSubmission.findFirst).not.toHaveBeenCalled()
      expect(tx.formSubmission.updateMany).not.toHaveBeenCalled()
      expect(tx.formSubmission.create).not.toHaveBeenCalled()
      expect(tx.formResponseValue.createMany).not.toHaveBeenCalled()
      expect(tx.auditLog.create).not.toHaveBeenCalled()
    },
  )

  it('G-F5-2 refuses direct entry for a Beneficiary registration form with ConflictException', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(form({ formType: 'BENEFICIARY_REGISTRATION' }))
    await expect(
      service.saveSubmission(identity(), projectId, formId, {
        clientSubmissionId,
        values: { score: '5' },
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      service.validateValues(identity(), projectId, formId, { score: '5' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })

  it('G-F5-1 denies publication to a non-author without forms.publish at the permission layer', async () => {
    state.actor = actor({ permissions: ['forms.read', 'forms.manage'] })
    const attempt = service.publishForm(identity(), projectId, formId, {
      expectedUpdatedAt: now.toISOString(),
    })
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException)
    await expect(attempt).rejects.toThrow('Required application permission is missing.')
    expect(state.permissions).toEqual(['forms.publish'])
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('G-F5-1 limits forms.publish to System Administrator and M&E grants and declares it on the route', () => {
    const granted = Object.entries(rolePermissions)
      .filter(([role, permissions]) => hasAtomicPermission(role, permissions, 'forms.publish'))
      .map(([role]) => role)
    expect(granted.sort()).toEqual(['MONITORING_AND_EVALUATION_OFFICER', 'SYSTEM_ADMINISTRATOR'])
    expect(Reflect.getMetadata(PERMISSION_KEY, MetadataController.prototype.publish)).toBe(
      'forms.publish',
    )
  })

  it('G-F5-1 offers a published survey form for entry and keeps drafts and retired types out of direct entry', async () => {
    tx.digitalForm.findMany.mockResolvedValue([
      form(),
      form({ id: '40000000-0000-4000-8000-000000000005', status: 'DRAFT', publishedAt: null }),
    ])
    const listed = await service.listForms(identity(), projectId)
    // The API lists every status; the entry workspace filters on PUBLISHED and the direct-entry types.
    expect(listed.map((item) => [item.formType, item.status])).toEqual([
      ['TRAINING_SURVEY', 'PUBLISHED'],
      ['TRAINING_SURVEY', 'DRAFT'],
    ])

    await expect(
      service.validateValues(identity(), projectId, formId, { score: '5' }),
    ).resolves.toMatchObject({ valid: true })

    tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'DRAFT' }))
    await expect(
      service.validateValues(identity(), projectId, formId, { score: '5' }),
    ).rejects.toBeInstanceOf(NotFoundException)

    tx.digitalForm.findFirst.mockResolvedValue(form({ formType: 'OTHER' }))
    await expect(
      service.validateValues(identity(), projectId, formId, { score: '5' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('G-F5-5 stops a cross-organization form read and submission write before the form query', async () => {
    tx.project.findFirst.mockImplementation(
      async (args: { where: { AND: [{ organizationId: string }, { id: string }] } }) => {
        const [scope, wanted] = args.where.AND
        return scope.organizationId === organizationId ? { id: wanted.id } : null
      },
    )
    state.actor = actor({ organizationId: '10000000-0000-4000-8000-0000000000ff' })

    await expect(service.getForm(identity(), projectId, formId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(
      service.saveSubmission(identity(), projectId, formId, {
        clientSubmissionId,
        values: { score: '5' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      service.updateSubmission(identity(), projectId, formId, submissionId, {
        values: { score: '5' },
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(tx.project.findFirst).toHaveBeenCalledTimes(3)
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    expect(tx.formSubmission.updateMany).not.toHaveBeenCalled()
  })
})
