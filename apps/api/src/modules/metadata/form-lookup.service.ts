import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { type FormRow, formSelection } from './metadata.mapper'

export async function requireForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  if (!UUID_PATTERN.test(formId)) throw new NotFoundException('Form unavailable.')
  return findForm(tx, actor, scopedProjectId, formId.toLowerCase())
}

export async function findForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
) {
  const row = await tx.digitalForm.findFirst({
    where: {
      id: formId,
      organizationId: actor.organizationId,
      projectId,
    },
    select: formSelection,
  })
  if (!row) throw new NotFoundException('Form unavailable.')
  return row
}

export async function requireLinks(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  activityId?: string | null,
  journeyStageId?: string | null,
) {
  if (activityId) {
    const activity = await tx.projectActivity.findFirst({
      where: {
        id: activityId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId,
        archivedAt: null,
      },
      select: { id: true },
    })
    if (!activity) throw new NotFoundException('Linked activity unavailable.')
  }
  if (journeyStageId) {
    const stage = await tx.journeyStage.findFirst({
      where: {
        id: journeyStageId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId,
        archivedAt: null,
      },
      select: { id: true },
    })
    if (!stage) throw new NotFoundException('Linked journey stage unavailable.')
  }
}

export async function requireSurveySubject(
  tx: Tx,
  actor: ApplicationIdentity,
  form: FormRow,
  beneficiaryId?: string,
): Promise<string | null> {
  if (beneficiaryId === undefined) return null
  if (form.formType !== 'TRAINING_SURVEY' || !UUID_PATTERN.test(beneficiaryId))
    throw new BadRequestException('An identified subject is supported only for a training survey.')
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read'))
    throw new ForbiddenException('Current beneficiary detail access is required.')
  const id = beneficiaryId.toLowerCase()
  const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: form.projectId,
      beneficiaryId: id,
      status: 'ACTIVE',
      endedDate: null,
      beneficiary: {
        organizationId: actor.organizationId,
        subjectType: 'INDIVIDUAL',
        isDummyRecord: false,
        archivedAt: null,
        consentRecorded: true,
        dataProcessingConsentRecorded: true,
      },
    },
    select: { id: true },
  })
  if (!enrollment) throw new NotFoundException('Eligible survey contributor unavailable.')
  return id
}

export async function findSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  form: FormRow,
  submissionId: string,
) {
  if (!UUID_PATTERN.test(submissionId)) throw new NotFoundException('Submission unavailable.')
  const row = await tx.formSubmission.findFirst({
    where: {
      id: submissionId.toLowerCase(),
      organizationId: actor.organizationId,
      projectId: form.projectId,
      formId: form.id,
      formVersion: form.version,
      submittedById: actor.userId,
      source: 'DIRECT_ENCODING',
      ...(form.formType === 'TRAINING_SURVEY' &&
      !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')
        ? { beneficiaryId: null }
        : {}),
    },
    select: {
      id: true,
      clientSubmissionId: true,
      beneficiaryId: true,
      status: true,
      formVersion: true,
      submittedAt: true,
      updatedAt: true,
      formResponseValue_submission: {
        select: { fieldId: true, value: true },
        orderBy: { fieldId: 'asc' },
      },
    },
  })
  if (!row) throw new NotFoundException('Submission unavailable.')
  const byId = new Map(form.formField_form.map((field) => [field.id, field.code]))
  const values: Record<string, string | number | boolean | string[] | null> = {}
  for (const response of row.formResponseValue_submission) {
    const code = byId.get(response.fieldId)
    if (code) values[code] = response.value as string | number | boolean | string[] | null
  }
  return {
    id: row.id,
    clientSubmissionId: row.clientSubmissionId,
    beneficiaryId: form.formType === 'TRAINING_SURVEY' ? row.beneficiaryId : null,
    status: row.status,
    formId: form.id,
    formVersion: row.formVersion,
    submittedAt: row.submittedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    values,
  }
}

export async function requireDraftSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  form: FormRow,
  submissionId: string,
) {
  const row = await findSubmission(tx, actor, form, submissionId)
  if (row.status !== 'DRAFT') throw new ConflictException('Submission is not editable.')
  return row
}

export async function replaceResponses(
  tx: Tx,
  actor: ApplicationIdentity,
  form: FormRow,
  submissionId: string,
  values: Record<string, string | number | boolean | string[] | null>,
) {
  await tx.formResponseValue.deleteMany({
    where: {
      organizationId: actor.organizationId,
      projectId: form.projectId,
      formId: form.id,
      submissionId,
    },
  })
  await tx.formResponseValue.createMany({
    data: form.formField_form.map((field) => {
      const value = values[field.code]
      return {
        organizationId: actor.organizationId,
        projectId: form.projectId,
        formId: form.id,
        submissionId,
        fieldId: field.id,
        value: value == null ? Prisma.JsonNull : value,
      }
    }),
  })
}
