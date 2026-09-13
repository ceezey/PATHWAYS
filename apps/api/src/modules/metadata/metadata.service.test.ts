import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))
vi.mock('../auth/authorized-operation', () => ({
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
    digitalForm: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    formField: { createMany: vi.fn(), deleteMany: vi.fn() },
    formSubmission: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    formResponseValue: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const service = new MetadataService({} as PrismaService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor()
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.digitalForm.findFirst.mockResolvedValue(form())
    tx.digitalForm.updateMany.mockResolvedValue({ count: 1 })
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it('keeps Grant Manager and Program Manager outside raw direct-entry permission', () => {
    expect(rolePermissions.GRANT_MANAGER).not.toContain('forms.read')
    expect(rolePermissions.GRANT_MANAGER).not.toContain('submissions.write')
    expect(rolePermissions.PROGRAM_MANAGER).toContain('forms.read')
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

  it('denies publication by a role name that lacks the locked M&E publishing authority', async () => {
    state.actor = actor('SYSTEM_ADMINISTRATOR')
    await expect(
      service.publishForm(state.actor, projectId, formId, { expectedUpdatedAt: now.toISOString() }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
  })

  it('denies self-approval before publication mutation or audit', async () => {
    state.actor = actor('MONITORING_AND_EVALUATION_OFFICER', authorId)
    await expect(
      service.publishForm(state.actor, projectId, formId, { expectedUpdatedAt: now.toISOString() }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
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

  it('rejects invalid or unknown direct-entry fields before persistence', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED' }))
    await expect(
      service.saveSubmission(state.actor as ApplicationIdentity, projectId, formId, {
        clientSubmissionId,
        values: { unknown_field: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })

  it('returns a repeat retry-safe submission when its form version and normalized values match', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED' }))
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({ id: submissionId, projectId, formId, formVersion: 1 })
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
    tx.digitalForm.findFirst.mockResolvedValue(form({ status: 'PUBLISHED' }))
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({ id: submissionId, projectId, formId, formVersion: 1 })
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
})
