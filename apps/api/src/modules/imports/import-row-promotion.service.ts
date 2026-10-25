import { ConflictException } from '@nestjs/common'
import { normalizeImportedRow } from '@pathways/imports/server'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { formFieldContract } from '../../common/forms/form-field-contract'
import type { Tx } from '../../common/prisma/transaction'
import { generateBeneficiaryCode } from '../beneficiaries/beneficiary-code'
import {
  type NormalizedValue,
  canonicalCode,
} from '../beneficiaries/beneficiary-registration.helpers'
import {
  type PromotionContext,
  type PromotionHandlers,
  loadFormFields,
  loadParticipationForm,
} from './import-promotion-context.service'
import { safeRawData } from './imports.helpers'
import { type ParticipantMatch, matchParticipant } from './participant-match'

const registrationOutcomes = { CREATE: 'CREATED', UPDATE: 'UPDATED', LINK: 'LINKED' } as const

// Leaves a registration row unprocessed with the code a reviewer will see.
async function holdRegistrationRow(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: PromotionContext['batch'],
  row: { id: string; rowNumber: number },
  code: string,
) {
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'UNPROCESSED',
      processingErrorCode: code,
      processingClaimId: null,
      processingClaimedAt: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_REGISTRATION_REVIEW_REQUIRED',
    entityType: 'DataImportRow',
    entityId: row.id,
    changes: { importBatchId: batch.id, sourceRowNumber: row.rowNumber, code },
  })
}

// The values a matched row is promoted with: the operation and participant code follow the match.
async function matchedValues(
  tx: Tx,
  actor: ApplicationIdentity,
  match: Extract<ParticipantMatch, { kind: 'NEW' | 'SAME' }>,
  values: Record<string, unknown>,
) {
  if (match.kind === 'SAME') {
    const profile = await tx.beneficiary.findFirst({
      where: { id: match.beneficiaryId, organizationId: actor.organizationId },
      select: { code: true },
    })
    return profile
      ? { ...values, registration_operation: 'LINK', beneficiary_code: profile.code }
      : null
  }
  const mapped = canonicalCode(values.beneficiary_code)
  const taken =
    mapped &&
    (await tx.beneficiary.findUnique({
      where: { organizationId_code: { organizationId: actor.organizationId, code: mapped } },
      select: { id: true },
    }))
  const code = mapped && !taken ? mapped : await generateBeneficiaryCode(tx, actor.organizationId)
  return { ...values, registration_operation: 'CREATE', beneficiary_code: code }
}

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
  const form =
    context.registrationForm ??
    (await promotion.registration.readRegistrationForm(
      tx,
      actor,
      batch.projectId,
      batch.formId,
      'IMPORTED_DATASET',
    ))
  let values = safeRawData(row.normalizedData as Prisma.JsonValue)
  // A file that carries the client's identifier matches participants by it, else the code decides as before.
  const byIdentifier =
    'external_identifier_value' in values &&
    !!form?.formField_form.some((item) => item.code === 'external_identifier_value')
  let outcome: 'CREATED' | 'UPDATED' | 'LINKED' | undefined =
    registrationOutcomes[values.registration_operation as keyof typeof registrationOutcomes]
  if (byIdentifier && form) {
    const match = await matchParticipant(tx, actor, {
      form,
      values: values as Record<string, NormalizedValue>,
    })
    if (match.kind === 'HOLD' || match.kind === 'CHANGED') {
      return holdRegistrationRow(tx, actor, batch, row, match.code)
    }
    if (match.kind === 'SAME' && match.enrolledHere) {
      await tx.dataImportRow.update({
        where: { id: row.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          processingErrorCode: null,
          processingClaimId: null,
          processingClaimedAt: null,
          registrationOutcome: 'UNCHANGED',
          matchedBeneficiaryId: match.beneficiaryId,
        },
      })
      await writeAuditLog(tx, actor, {
        projectId: batch.projectId,
        action: 'IMPORT_REGISTRATION_UNCHANGED',
        entityType: 'DataImportRow',
        entityId: row.id,
        changes: { importBatchId: batch.id, sourceRowNumber: row.rowNumber },
      })
      return
    }
    const matched = await matchedValues(tx, actor, match, values)
    if (!matched) return holdRegistrationRow(tx, actor, batch, row, 'UNKNOWN_IDENTITY')
    values = matched
    outcome = match.kind === 'SAME' ? 'LINKED' : 'CREATED'
  }
  const registration = {
    projectId: batch.projectId,
    formId: batch.formId,
    clientRegistrationId: row.id,
    values,
    source: 'IMPORTED_DATASET' as const,
    validatedById: batch.reviewedById,
    importBatchId: batch.id,
    importRowId: row.id,
    ...(byIdentifier ? { matchByIdentifier: true } : {}),
  }
  const result = form
    ? await promotion.registration.promoteRegistration(tx, actor, registration, { form })
    : await promotion.registration.promoteRegistration(tx, actor, registration)
  if (result.kind === 'REVIEW') {
    return holdRegistrationRow(tx, actor, batch, row, result.code)
  }
  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
      registrationOutcome: outcome,
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
      beneficiaryId: result.beneficiaryId,
      enrollmentId: result.enrollmentId,
      submissionId: result.submissionId,
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
