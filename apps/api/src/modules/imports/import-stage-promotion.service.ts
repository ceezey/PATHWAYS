import { ConflictException } from '@nestjs/common'
import { normalizeImportedRow } from '@pathways/imports/server'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { formFieldContract } from '../../common/forms/form-field-contract'
import type { Tx } from '../../common/prisma/transaction'
import {
  type NormalizedValue,
  canonicalIdentifierType,
  normalizeIdentifier,
} from '../beneficiaries/beneficiary-registration.helpers'
import type { PromotionContext } from './import-promotion-context.service'
import { holdImportRow, insertValidatedSubmission } from './import-row-promotion.service'
import { safeRawData } from './imports.helpers'
import { differingFields, splitRejected } from './participant-match'

type Values = Record<string, NormalizedValue>

const HOLD_ACTION = 'IMPORT_STAGE_REVIEW_REQUIRED'
const NAME_CODES = [
  ['first_name', 'firstName'],
  ['middle_name', 'middleName'],
  ['last_name', 'lastName'],
] as const

const isBlank = (value: unknown) => value == null || (typeof value === 'string' && !value.trim())
const sameText = (a: unknown, b: unknown) =>
  String(a).trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase()
const dayOf = (date: Date) => date.toISOString().slice(0, 10)

/**
 * The person a stage row names: the registration row of the same file row gives the ID, and a delta file has none,
 * so the stage's own ID is used. The profile and enrollment are those of the batch's project.
 */
export async function findStagePerson(
  tx: Tx,
  actor: ApplicationIdentity,
  context: PromotionContext,
  rowNumber: number,
  values: Values,
) {
  const { batch, parentBatchId } = context
  if (!parentBatchId) throw new ConflictException('The stage form version is unavailable.')
  const parent = await tx.dataImportRow.findFirst({
    where: {
      organizationId: actor.organizationId,
      importBatchId: parentBatchId,
      rowNumber,
    },
    select: { status: true, normalizedData: true },
  })
  const source = parent ? ((parent.normalizedData ?? {}) as Values) : values
  const identifierType = canonicalIdentifierType(
    source.external_identifier_type ?? context.identifierType,
  )
  const identifier =
    typeof source.external_identifier_value === 'string'
      ? normalizeIdentifier(source.external_identifier_value)
      : ''
  const known =
    identifierType && identifier
      ? await tx.beneficiaryIdentifier.findUnique({
          where: {
            organizationId_identifierType_normalizedValue: {
              organizationId: actor.organizationId,
              identifierType,
              normalizedValue: identifier,
            },
          },
          select: { beneficiaryId: true },
        })
      : null
  const profile = known
    ? await tx.beneficiary.findFirst({
        where: { id: known.beneficiaryId, organizationId: actor.organizationId, archivedAt: null },
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          consentRecorded: true,
          dataProcessingConsentRecorded: true,
        },
      })
    : null
  const enrollment = known
    ? await tx.beneficiaryProjectEnrollment.findUnique({
        where: {
          organizationId_projectId_beneficiaryId: {
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            beneficiaryId: known.beneficiaryId,
          },
        },
        select: { id: true, enrollmentDate: true, endedDate: true },
      })
    : null
  return { parent, identifier, known, profile, enrollment }
}

/** The latest validated answers of this person on any version of the stage form, or null when there are none. */
export async function readStageBaseline(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formCode: string,
  beneficiaryId: string,
) {
  const baseline = await tx.formSubmission.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      beneficiaryId,
      status: 'VALIDATED',
      form: { code: formCode },
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      formResponseValue_submission: { select: { value: true, field: { select: { code: true } } } },
    },
  })
  return baseline
    ? new Map<string, unknown>(
        baseline.formResponseValue_submission.map((item) => [item.field.code, item.value]),
      )
    : null
}

/**
 * Promotes one claimed row of a stage batch: the person is found by the file's ID, then a submission,
 * one participation with its journey event and, for a scored stage, one assessment are written.
 * A row that cannot be written is held with a code a person can fix, and that code is returned.
 * A reviewer's values replace the row's and are not held for differing from what PATHWAYS holds.
 */
export async function promoteStageInTx(
  tx: Tx,
  actor: ApplicationIdentity,
  context: PromotionContext,
  rowId: string,
  claimId: string,
  resolved?: { values: Values },
): Promise<string | undefined> {
  const { batch, stageForm, fields, parentBatchId } = context
  if (!stageForm || !fields || !parentBatchId) {
    throw new ConflictException('The stage form version is unavailable.')
  }
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
  if (!row) throw new ConflictException('The stage row claim is unavailable.')
  const hold = async (code: string) => {
    await holdImportRow(tx, actor, batch, row, code, HOLD_ACTION)
    return code
  }

  const verified = normalizeImportedRow(
    fields.map(formFieldContract),
    resolved?.values ?? safeRawData(row.normalizedData as Prisma.JsonValue),
  )
  if (!verified.valid) throw new ConflictException('The normalized row no longer validates.')
  const values: Values = verified.values

  const { parent, identifier, known, profile, enrollment } = await findStagePerson(
    tx,
    actor,
    context,
    row.rowNumber,
    values,
  )
  // A registration row that failed will never create the person, so the stage row cannot wait for it.
  if (parent?.status === 'FAILED') return hold('STAGE_IDENTITY_MISMATCH')
  if (!known || !profile || !enrollment) return hold('STAGE_IDENTITY_MISMATCH')

  // A blank on either side is no contradiction; only two different answers are.
  const ownIdentifier =
    typeof values.external_identifier_value === 'string'
      ? normalizeIdentifier(values.external_identifier_value)
      : ''
  if (
    (ownIdentifier && ownIdentifier !== identifier) ||
    NAME_CODES.some(
      ([code, key]) =>
        !isBlank(values[code]) && !isBlank(profile[key]) && !sameText(values[code], profile[key]),
    )
  ) {
    return hold('STAGE_IDENTITY_MISMATCH')
  }
  // A form default never stands for consent, so an unmapped consent column holds the row.
  if (
    !context.consentMapped ||
    values.stage_consent !== true ||
    !profile.consentRecorded ||
    !profile.dataProcessingConsentRecorded
  ) {
    return hold('STAGE_CONSENT_MISSING')
  }
  const stageDate = values.stage_date
  if (typeof stageDate !== 'string' || !stageDate) return hold('STAGE_DATE_MISSING')
  if (
    stageDate < dayOf(enrollment.enrollmentDate) ||
    (enrollment.endedDate && stageDate > dayOf(enrollment.endedDate))
  ) {
    return hold('STAGE_DATE_OUTSIDE_ENROLLMENT')
  }

  // The latest validated answers of this person on any version of the form are what the file is compared with.
  const stored = await readStageBaseline(
    tx,
    actor,
    batch.projectId,
    stageForm.code,
    known.beneficiaryId,
  )
  if (stored) {
    const differing = differingFields({ formField_form: fields }, values, {
      enrolledHere: true,
      identityOnly: false,
      stored,
    })
    // A reviewer chose against this baseline, so only a file row is held, and an earlier rejection forgives only a file value.
    const { kept } = resolved
      ? { kept: differing }
      : await splitRejected(tx, actor, known.beneficiaryId, differing, values)
    if (kept.length > 0 && !resolved) return hold('STAGE_CHANGED')
    if (kept.length === 0) {
      await tx.dataImportRow.update({
        where: { id: row.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          processingErrorCode: null,
          processingClaimId: null,
          processingClaimedAt: null,
          registrationOutcome: 'UNCHANGED',
          matchedBeneficiaryId: known.beneficiaryId,
        },
      })
      await writeAuditLog(tx, actor, {
        projectId: batch.projectId,
        action: 'IMPORT_STAGE_UNCHANGED',
        entityType: 'DataImportRow',
        entityId: row.id,
        changes: { importBatchId: batch.id, sourceRowNumber: row.rowNumber },
      })
      return
    }
  }

  const submission = await insertValidatedSubmission(
    tx,
    actor,
    batch,
    row.id,
    fields,
    values,
    known.beneficiaryId,
  )
  const scope = {
    organizationId: actor.organizationId,
    projectId: batch.projectId,
    enrollmentId: enrollment.id,
    activityId: stageForm.activityId,
  }
  const eventDate = new Date(`${stageDate}T00:00:00.000Z`)
  // The first participation on the activity moves the current stage; a later stage of the same activity adds none.
  const taken = await tx.beneficiaryActivityParticipation.findFirst({
    where: scope,
    select: { id: true },
  })
  const earlierDate = stored?.get('stage_date')
  if (!taken) {
    const participation = await tx.beneficiaryActivityParticipation.create({
      data: {
        ...scope,
        attendanceStatus: 'PRESENT',
        progressStatus: 'IN_PROGRESS',
        participationDate: eventDate,
        sourceSubmissionId: submission.id,
        recordedById: actor.userId,
      },
      select: { id: true },
    })
    await tx.beneficiaryJourneyEvent.create({
      data: {
        ...scope,
        stageId: stageForm.journeyStageId,
        participationId: participation.id,
        eventType: 'PARTICIPATION',
        eventDate,
        description: `${stageForm.name} recorded`,
        recordedById: actor.userId,
      },
    })
  } else if (typeof earlierDate === 'string' && earlierDate !== stageDate) {
    // A corrected date is a new event that corrects the original, as a journey correction does.
    // shortcut: a corrected stage date does not move the participation date, upgrade if the current stage must follow corrections
    const original = await tx.beneficiaryJourneyEvent.findFirst({
      where: {
        ...scope,
        stageId: stageForm.journeyStageId,
        eventType: 'PARTICIPATION',
        correctsEventId: null,
      },
      select: { id: true, participationId: true },
    })
    if (original) {
      await tx.beneficiaryJourneyEvent.create({
        data: {
          ...scope,
          stageId: stageForm.journeyStageId,
          participationId: original.participationId,
          eventType: 'PARTICIPATION',
          eventDate,
          description: `${stageForm.name} recorded`,
          correctsEventId: original.id,
          correctionReason: 'The stage date was corrected in import review.',
          recordedById: actor.userId,
        },
      })
    }
  }

  // OTHER keeps an imported score out of the pre/post improvement figure.
  const score = Number(values.total_score)
  if (stageForm.scoreRule && !isBlank(values.total_score) && Number.isFinite(score)) {
    const latest = await tx.assessmentResult.findFirst({
      where: scope,
      orderBy: [{ assessmentDate: 'desc' }, { recordedAt: 'desc' }],
      select: { score: true },
    })
    if (!latest || Number(latest.score) !== score) {
      await tx.assessmentResult.create({
        data: {
          ...scope,
          type: 'OTHER',
          score,
          maximumScore: stageForm.scoreRule.questions.length,
          assessmentDate: eventDate,
          sourceSubmissionId: submission.id,
          recordedById: actor.userId,
        },
      })
    }
  }

  await tx.dataImportRow.update({
    where: { id: row.id },
    data: {
      status: 'PROCESSED',
      processedAt: submission.submittedAt,
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
      registrationOutcome: 'CREATED',
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_STAGE_ROW_COMMITTED',
    entityType: 'DataImportRow',
    entityId: row.id,
    changes: {
      importBatchId: batch.id,
      sourceRowNumber: row.rowNumber,
      beneficiaryId: known.beneficiaryId,
      enrollmentId: enrollment.id,
      submissionId: submission.id,
    },
  })
}
