import type { PrismaService } from '@app/prisma/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../auth/developer-access'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as unknown,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    _identity: unknown,
    _permission: unknown,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => work(state.tx, state.actor),
}))
const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const formId = '30000000-0000-4000-8000-000000000003'
const subject = '40000000-0000-4000-8000-000000000004'
const id = '50000000-0000-4000-8000-000000000005'
const request = '60000000-0000-4000-8000-000000000006'
const currentActor = () => {
  if (!state.actor) throw new Error('Fixture actor unavailable')
  return state.actor
}
const now = new Date('2026-09-27T00:00:00Z')
const form = {
  id: formId,
  projectId: project,
  code: 'survey',
  name: 'Survey',
  formType: 'TRAINING_SURVEY',
  status: 'PUBLISHED',
  version: 1,
  activityId: null,
  journeyStageId: null,
  createdById: subject,
  publishedAt: now,
  archivedAt: null,
  updatedAt: now,
  description: null,
  formField_form: [
    {
      id: request,
      code: 'notes',
      label: 'Notes',
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
      maximumLength: 100,
      sequenceNo: 1,
    },
  ],
}
const tx = {
  project: { findFirst: vi.fn() },
  digitalForm: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
  formSubmission: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  formResponseValue: { deleteMany: vi.fn(), createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
const service = new MetadataService({} as PrismaService, { promoteParticipation: vi.fn() } as never)
const row = (beneficiaryId: string | null = subject, status = 'DRAFT') => ({
  id,
  clientSubmissionId: request,
  beneficiaryId,
  status,
  formVersion: 1,
  submittedAt: null,
  updatedAt: now,
  formResponseValue_submission: [{ fieldId: request, value: null }],
})
describe('optional identified training survey source boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.actor = {
      id: subject,
      userId: subject,
      organizationId: org,
      aal: 'aal2',
      fullName: 'Synthetic',
      roles: ['PROJECT_OFFICER'],
      permissions: ['submissions.write', 'beneficiaries.records.read'],
      assignedProjectIds: [project],
    }
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: project })
    tx.digitalForm.findFirst.mockResolvedValue(form)
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue({ id })
    tx.formSubmission.create.mockResolvedValue({ id })
    tx.formSubmission.updateMany.mockResolvedValue({ count: 1 })
  })
  it('saves only the server-scoped consented active individual UUID without an enrollment link', async () => {
    tx.formSubmission.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row())
    const saved = await service.saveSubmission(currentActor(), project, formId, {
      clientSubmissionId: request,
      values: {},
      beneficiaryId: subject,
    })
    expect(saved.beneficiaryId).toBe(subject)
    expect(tx.beneficiaryProjectEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: org,
        projectId: project,
        beneficiaryId: subject,
        status: 'ACTIVE',
        endedDate: null,
        beneficiary: {
          organizationId: org,
          subjectType: 'INDIVIDUAL',
          isDummyRecord: false,
          archivedAt: null,
          consentRecorded: true,
          dataProcessingConsentRecorded: true,
        },
      },
      select: { id: true },
    })
    expect(tx.formSubmission.create.mock.calls[0][0].data).toMatchObject({
      beneficiaryId: subject,
      status: 'DRAFT',
      submittedById: subject,
    })
    expect(tx.formSubmission.create.mock.calls[0][0].data).not.toHaveProperty('enrollmentId')
  })
  it('allows anonymous save without querying any beneficiary row', async () => {
    currentActor().permissions = ['submissions.write']
    tx.formSubmission.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row(null))
    expect(
      (
        await service.saveSubmission(currentActor(), project, formId, {
          clientSubmissionId: request,
          values: {},
        })
      ).beneficiaryId,
    ).toBeNull()
    expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    expect(tx.formSubmission.findFirst.mock.calls[0][0].where.beneficiaryId).toBeNull()
  })
  it('denies identified save after fresh detail permission loss before subject retrieval or writes', async () => {
    currentActor().permissions = ['submissions.write']
    await expect(
      service.saveSubmission(currentActor(), project, formId, {
        clientSubmissionId: request,
        values: {},
        beneficiaryId: subject,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    expect(tx.formSubmission.findFirst).not.toHaveBeenCalled()
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })
  it('denies unavailable live eligibility and wrong form linkage before writes', async () => {
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    await expect(
      service.saveSubmission(currentActor(), project, formId, {
        clientSubmissionId: request,
        values: {},
        beneficiaryId: subject,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
    tx.digitalForm.findFirst.mockResolvedValue({ ...form, formType: 'OTHER' })
    await expect(
      service.saveSubmission(currentActor(), project, formId, {
        clientSubmissionId: request,
        values: {},
        beneficiaryId: subject,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('recovers the same keyed subject and denies retargeting the request', async () => {
    tx.formSubmission.findFirst
      .mockResolvedValueOnce({ ...row(), projectId: project, formId, formVersion: 1 })
      .mockResolvedValueOnce(row())
    expect(
      (
        await service.saveSubmission(currentActor(), project, formId, {
          clientSubmissionId: request,
          values: {},
          beneficiaryId: subject,
        })
      ).id,
    ).toBe(id)
    tx.formSubmission.findFirst.mockResolvedValue({
      ...row('70000000-0000-4000-8000-000000000007'),
      projectId: project,
      formId,
      formVersion: 1,
    })
    await expect(
      service.saveSubmission(currentActor(), project, formId, {
        clientSubmissionId: request,
        values: {},
        beneficiaryId: subject,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.formSubmission.create).not.toHaveBeenCalled()
  })
  it('scopes revoked own survey reads to anonymous records before retrieving values', async () => {
    currentActor().permissions = ['submissions.write']
    tx.formSubmission.findFirst.mockResolvedValue(null)
    await expect(service.getSubmission(currentActor(), project, formId, id)).rejects.toMatchObject({
      status: 404,
    })
    expect(tx.formSubmission.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: org,
      projectId: project,
      submittedById: subject,
      beneficiaryId: null,
    })
  })
  it('rechecks persisted eligibility even for an already validated survey retry', async () => {
    tx.formSubmission.findFirst.mockResolvedValue(row(subject, 'VALIDATED'))
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    await expect(
      service.submitSubmission(currentActor(), project, formId, id, {
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.formSubmission.updateMany).not.toHaveBeenCalled()
  })
  it('preserves validated activity monitoring retry without invoking survey eligibility', async () => {
    tx.digitalForm.findFirst.mockResolvedValue({ ...form, formType: 'ACTIVITY_MONITORING' })
    tx.formSubmission.findFirst.mockResolvedValue(row(subject, 'VALIDATED'))
    expect(
      (
        await service.submitSubmission(currentActor(), project, formId, id, {
          expectedUpdatedAt: now.toISOString(),
        })
      ).status,
    ).toBe('VALIDATED')
    expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
  })
})
