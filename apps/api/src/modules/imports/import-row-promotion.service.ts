import { ConflictException } from '@nestjs/common'
import { normalizeImportedRow } from '@pathways/imports/server'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { formFieldContract } from '../metadata/metadata.mapper'
import {
  type PromotionContext,
  type PromotionHandlers,
  loadFormFields,
  loadParticipationForm,
} from './import-promotion-context.service'
import { safeRawData } from './imports.helpers'

export async function promoteRegistrationInTx(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  context: PromotionContext,
  rowId: string,
  claimId: string,
) {
  const { batch } = context
  const row = await tx.dataImportRow.findFirst({
    where: {
      id: rowId,
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimId: claimId,
      mappingRevision: batch.mappingRevision,
      validationRevision: batch.validationRevision,
    },
    select: { id: true, rowNumber: true, normalizedData: true },
  })
  if (!row) throw new ConflictException('The registration row claim is unavailable.')
  const registration = {
    projectId: batch.projectId,
    formId: batch.formId,
    clientRegistrationId: row.id,
    values: safeRawData(row.normalizedData as Prisma.JsonValue),
    source: 'IMPORTED_DATASET' as const,
    validatedById: batch.reviewedById,
    importBatchId: batch.id,
    importRowId: row.id,
  }
  const outcome = context.registrationForm
    ? await promotion.registration.promoteRegistration(tx, actor, registration, {
        form: context.registrationForm,
      })
    : await promotion.registration.promoteRegistration(tx, actor, registration)
  const finishedAt = new Date()
  if (outcome.kind === 'REVIEW') {
    await tx.dataImportRow.update({
      where: { id: row.id },
      data: {
        status: 'UNPROCESSED',
        processingErrorCode: outcome.code,
        processingClaimId: null,
        processingClaimedAt: null,
      },
    })
    await writeAuditLog(tx, actor, {
      projectId: batch.projectId,
      action: 'IMPORT_REGISTRATION_REVIEW_REQUIRED',
      entityType: 'DataImportRow',
      entityId: row.id,
      changes: {
        importBatchId: batch.id,
        sourceRowNumber: row.rowNumber,
        code: outcome.code,
      },
    })
    return
  }
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'PROCESSED',
      processedAt: finishedAt,
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_REGISTRATION_ROW_COMMITTED',
    entityType: 'DataImportRow',
    entityId: row.id,
    changes: {
      importBatchId: batch.id,
      sourceRowNumber: row.rowNumber,
      beneficiaryId: outcome.beneficiaryId,
      enrollmentId: outcome.enrollmentId,
      submissionId: outcome.submissionId,
    },
  })
}

export async function promoteParticipationInTx(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  context: PromotionContext,
  rowId: string,
  claimId: string,
) {
  const { batch } = context
  const row = await tx.dataImportRow.findFirst({
    where: {
      id: rowId,
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimId: claimId,
      mappingRevision: batch.mappingRevision,
      validationRevision: batch.validationRevision,
    },
    select: { id: true, rowNumber: true, normalizedData: true },
  })
  if (!row) throw new ConflictException('The participation row claim is unavailable.')
  const existing = await tx.formSubmission.findUnique({
    where: { importRowId: row.id },
    select: { id: true },
  })
  if (existing) {
    const participation = await tx.beneficiaryActivityParticipation.findUnique({
      where: { sourceSubmissionId: existing.id },
      select: { id: true },
    })
    if (!participation)
      throw new ConflictException('The imported submission is missing its participation effect.')
    await tx.dataImportRow.update({
      where: { id: row.id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingClaimId: null,
        processingClaimedAt: null,
        processingErrorCode: null,
      },
    })
    return
  }
  const values = safeRawData(row.normalizedData as Prisma.JsonValue)
  const fields = context.fields ?? (await loadFormFields(tx, actor, batch))
  const verified = normalizeImportedRow(fields.map(formFieldContract), values)
  if (!verified.valid) throw new ConflictException('The normalized row no longer validates.')
  const form = context.participationForm ?? (await loadParticipationForm(tx, actor, batch))
  if (!form) throw new ConflictException('The activity-monitoring form version is unavailable.')
  const submission = await tx.formSubmission.create({
    data: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      formVersion: batch.formVersion,
      clientSubmissionId: row.id,
      importBatchId: batch.id,
      importRowId: row.id,
      submittedById: actor.userId,
      source: 'IMPORTED_DATASET',
      status: 'DRAFT',
    },
    select: { id: true },
  })
  await tx.formResponseValue.createMany({
    data: fields.map((field) => ({
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      submissionId: submission.id,
      fieldId: field.id,
      value:
        verified.values[field.code] === null
          ? Prisma.JsonNull
          : (verified.values[field.code] as Prisma.InputJsonValue),
    })),
  })
  const outcome = await promotion.participants.promoteParticipation(tx, actor, {
    projectId: batch.projectId,
    form,
    submissionId: submission.id,
    values: verified.values,
    validatedById: batch.reviewedById,
  })
  const finishedAt = new Date()
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'PROCESSED',
      processedAt: finishedAt,
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_PARTICIPATION_ROW_COMMITTED',
    entityType: 'DataImportRow',
    entityId: row.id,
    changes: {
      importBatchId: batch.id,
      sourceRowNumber: row.rowNumber,
      participationId: outcome.participationId,
      enrollmentId: outcome.enrollmentId,
      submissionId: submission.id,
    },
  })
}

export async function promoteGenericInTx(
  tx: Tx,
  actor: ApplicationIdentity,
  context: PromotionContext,
  rowId: string,
  claimId: string,
) {
  const { batch } = context
  const row = await tx.dataImportRow.findFirst({
    where: {
      id: rowId,
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      importBatchId: batch.id,
      status: 'PROCESSING',
      processingClaimId: claimId,
      mappingRevision: batch.mappingRevision,
      validationRevision: batch.validationRevision,
    },
    select: { id: true, rowNumber: true, normalizedData: true },
  })
  if (!row) throw new ConflictException('The import row claim is unavailable.')
  const existing = await tx.formSubmission.findUnique({
    where: { importRowId: row.id },
    select: { id: true },
  })
  if (existing) {
    await tx.dataImportRow.update({
      where: { id: row.id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingClaimId: null,
        processingClaimedAt: null,
        processingErrorCode: null,
      },
    })
    return
  }
  const values = safeRawData(row.normalizedData as Prisma.JsonValue)
  const fields = context.fields ?? (await loadFormFields(tx, actor, batch))
  const verified = normalizeImportedRow(fields.map(formFieldContract), values)
  if (!verified.valid) throw new ConflictException('The normalized row no longer validates.')
  const submission = await tx.formSubmission.create({
    data: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      formVersion: batch.formVersion,
      clientSubmissionId: row.id,
      importBatchId: batch.id,
      importRowId: row.id,
      submittedById: actor.userId,
      source: 'IMPORTED_DATASET',
      status: 'DRAFT',
    },
    select: { id: true },
  })
  await tx.formResponseValue.createMany({
    data: fields.map((field) => ({
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      submissionId: submission.id,
      fieldId: field.id,
      value:
        verified.values[field.code] === null
          ? Prisma.JsonNull
          : (verified.values[field.code] as Prisma.InputJsonValue),
    })),
  })
  const submittedAt = new Date()
  await tx.formSubmission.update({
    where: { id: submission.id },
    data: {
      status: 'VALIDATED',
      submittedAt,
      validatedById: batch.reviewedById,
      validatedAt: submittedAt,
    },
  })
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'PROCESSED',
      processedAt: submittedAt,
      processingClaimId: null,
      processingClaimedAt: null,
      processingErrorCode: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_ROW_PROMOTED',
    entityType: 'FormSubmission',
    entityId: submission.id,
    changes: {
      importBatchId: batch.id,
      importRowId: row.id,
      sourceRowNumber: row.rowNumber,
      formVersion: batch.formVersion,
      validationRevision: batch.validationRevision,
    },
  })
}
