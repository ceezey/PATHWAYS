import { NotFoundException } from '@nestjs/common'
import {
  type FormValidationMode,
  type ListSubmissionsQuery,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { findSubmission, requireForm } from './form-lookup.service'
import { assertDirectEntryForm } from './metadata.helpers'
import { formFieldContract } from './metadata.mapper'

export async function validateFormValues(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  values: unknown,
  mode: FormValidationMode,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
  assertDirectEntryForm(form)
  return validateAndNormalizeFormData(form.formField_form.map(formFieldContract), values, mode)
}

export async function listOwnSubmissions(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  query: ListSubmissionsQuery,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  const offset = Math.min(10_000, Math.max(0, query.offset ?? 0))
  const limit = Math.min(50, Math.max(1, query.limit ?? 10))
  const where = {
    organizationId: actor.organizationId,
    projectId: form.projectId,
    formId: form.id,
    formVersion: form.version,
    submittedById: actor.userId,
    source: 'DIRECT_ENCODING' as const,
  }
  const total = await tx.formSubmission.count({ where })
  const rows = await tx.formSubmission.findMany({
    where,
    select: {
      id: true,
      status: true,
      formVersion: true,
      submittedAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    skip: offset,
    take: limit,
  })
  return {
    offset,
    limit,
    total,
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      formVersion: row.formVersion,
      submittedAt: row.submittedAt?.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  }
}

export async function readSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  submissionId: string,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  return findSubmission(tx, actor, form, submissionId)
}

export async function readSubmissionByClientId(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  clientSubmissionId: string,
) {
  if (!UUID_PATTERN.test(clientSubmissionId)) {
    throw new NotFoundException('Submission unavailable.')
  }
  const form = await requireForm(tx, actor, projectId, formId)
  const row = await tx.formSubmission.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: form.projectId,
      formId: form.id,
      formVersion: form.version,
      submittedById: actor.userId,
      clientSubmissionId: clientSubmissionId.toLowerCase(),
      source: 'DIRECT_ENCODING',
    },
    select: { id: true },
  })
  if (!row) throw new NotFoundException('Submission unavailable.')
  return findSubmission(tx, actor, form, row.id)
}

export async function validateStoredSubmission(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  submissionId: string,
) {
  const form = await requireForm(tx, actor, projectId, formId)
  if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
  assertDirectEntryForm(form)
  const submission = await findSubmission(tx, actor, form, submissionId)
  return validateAndNormalizeFormData(
    form.formField_form.map(formFieldContract),
    submission.values,
    'final',
  )
}
