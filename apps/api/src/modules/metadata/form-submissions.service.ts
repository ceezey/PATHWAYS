import { ConflictException, NotFoundException } from '@nestjs/common'
import {
  type SaveSubmissionRequest,
  type SubmitSubmissionRequest,
  type UpdateSubmissionRequest,
  hasAtomicPermission,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { ParticipantsService } from '../participants/participants.service'
import {
  findSubmission,
  replaceResponses,
  requireDraftSubmission,
  requireForm,
  requireSurveySubject,
} from './form-lookup.service'
import { assertDirectEntryForm, assertValues, expectedDate, sameValues } from './metadata.helpers'
import { formFieldContract } from './metadata.mapper'

export async function saveDraftSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  input: SaveSubmissionRequest,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
  assertDirectEntryForm(form)
  const validation = validateAndNormalizeFormData(
    form.formField_form.map(formFieldContract),
    input.values,
    'draft',
  )
  assertValues(validation)
  const beneficiaryId = await requireSurveySubject(tx, actor, form, input.beneficiaryId)
  const clientSubmissionId = input.clientSubmissionId.toLowerCase()
  const existing = await tx.formSubmission.findFirst({
    where: {
      organizationId: actor.organizationId,
      submittedById: actor.userId,
      clientSubmissionId,
      ...(form.formType === 'TRAINING_SURVEY' &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')
        ? { beneficiaryId: null }
        : {}),
    },
    select: {
      id: true,
      projectId: true,
      formId: true,
      formVersion: true,
      beneficiaryId: true,
    },
  })
  if (existing) {
    if (
      existing.projectId !== form.projectId ||
      existing.formId !== form.id ||
      existing.formVersion !== form.version ||
      existing.beneficiaryId !== beneficiaryId
    ) {
      throw new ConflictException('Submission identifier is already in use.')
    }
    const persisted = await findSubmission(tx, actor, form, existing.id)
    if (!sameValues(persisted.values, validation.values)) {
      throw new ConflictException('Submission identifier was reused with different values.')
    }
    return persisted
  }
  let created: { id: string }
  try {
    created = await tx.formSubmission.create({
      data: {
        organizationId: actor.organizationId,
        projectId: form.projectId,
        formId: form.id,
        formVersion: form.version,
        clientSubmissionId,
        beneficiaryId,
        submittedById: actor.userId,
        source: 'DIRECT_ENCODING',
        status: 'DRAFT',
        submittedAt: null,
      },
      select: { id: true },
    })
  } catch (caught) {
    if ((caught as { code?: string }).code === 'P2002') {
      throw new ConflictException('Submission identifier is already in use.')
    }
    throw caught
  }
  await replaceResponses(tx, actor, form, created.id, validation.values)
  await writeAuditLog(tx, actor, {
    projectId: form.projectId,
    action: 'FORM_SUBMISSION_DRAFT_SAVED',
    entityType: 'FormSubmission',
    entityId: created.id,
    changes: {
      formId: form.id,
      formVersion: form.version,
      fieldCount: form.formField_form.length,
    },
  })
  return findSubmission(tx, actor, form, created.id)
}

export async function updateDraftSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  submissionId: string,
  input: UpdateSubmissionRequest,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
  assertDirectEntryForm(form)
  const submission = await requireDraftSubmission(tx, actor, form, submissionId)
  const validation = validateAndNormalizeFormData(
    form.formField_form.map(formFieldContract),
    input.values,
    'draft',
  )
  assertValues(validation)
  const expected = expectedDate(input.expectedUpdatedAt)
  const changed = await tx.formSubmission.updateMany({
    where: {
      id: submission.id,
      organizationId: actor.organizationId,
      submittedById: actor.userId,
      status: 'DRAFT',
      updatedAt: expected,
    },
    data: { updatedAt: new Date() },
  })
  if (changed.count !== 1) throw new ConflictException('Draft changed; reload before saving.')
  await replaceResponses(tx, actor, form, submission.id, validation.values)
  await writeAuditLog(tx, actor, {
    projectId: form.projectId,
    action: 'FORM_SUBMISSION_DRAFT_SAVED',
    entityType: 'FormSubmission',
    entityId: submission.id,
    changes: {
      formId: form.id,
      formVersion: form.version,
      fieldCount: form.formField_form.length,
    },
  })
  return findSubmission(tx, actor, form, submission.id)
}

export async function submitDraftSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  participants: Pick<ParticipantsService, 'promoteParticipation'>,
  projectId: string,
  formId: string,
  submissionId: string,
  input: SubmitSubmissionRequest,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
  assertDirectEntryForm(form)
  const submission = await findSubmission(tx, actor, form, submissionId)
  if (form.formType === 'TRAINING_SURVEY')
    await requireSurveySubject(tx, actor, form, submission.beneficiaryId ?? undefined)
  if (submission.status === 'VALIDATED') return submission
  if (submission.status !== 'DRAFT') throw new ConflictException('Submission is not editable.')
  const validation = validateAndNormalizeFormData(
    form.formField_form.map(formFieldContract),
    submission.values,
    'final',
  )
  assertValues(validation)
  const expected = expectedDate(input.expectedUpdatedAt)
  if (form.formType === 'ACTIVITY_MONITORING') {
    if (submission.updatedAt !== expected.toISOString()) {
      throw new ConflictException('Draft changed; reload before submitting.')
    }
    await participants.promoteParticipation(tx, actor, {
      projectId: form.projectId,
      form: {
        id: form.id,
        version: form.version,
        activityId: form.activityId,
        journeyStageId: form.journeyStageId,
      },
      submissionId: submission.id,
      values: validation.values,
      validatedById: actor.userId,
    })
    return findSubmission(tx, actor, form, submission.id)
  }
  const now = new Date()
  const changed = await tx.formSubmission.updateMany({
    where: {
      id: submission.id,
      organizationId: actor.organizationId,
      submittedById: actor.userId,
      status: 'DRAFT',
      updatedAt: expected,
    },
    data: {
      status: 'VALIDATED',
      submittedAt: now,
      validatedById: actor.userId,
      validatedAt: now,
    },
  })
  if (changed.count !== 1) {
    const current = await findSubmission(tx, actor, form, submission.id)
    if (current.status === 'VALIDATED') return current
    throw new ConflictException('Draft changed; reload before submitting.')
  }
  await writeAuditLog(tx, actor, {
    projectId: form.projectId,
    action: 'FORM_SUBMISSION_VALIDATED',
    entityType: 'FormSubmission',
    entityId: submission.id,
    changes: {
      formId: form.id,
      formVersion: form.version,
      fieldCount: form.formField_form.length,
    },
  })
  return findSubmission(tx, actor, form, submission.id)
}
