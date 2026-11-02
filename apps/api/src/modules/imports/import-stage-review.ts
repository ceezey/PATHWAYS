import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { totalScore } from '@pathways/imports/server'
import type { ImportRowReviewResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import type { requireBatchWithHeaders } from './import-batches.service'
import { reconcileBatch } from './import-claims.service'
import { requireSurveyImportPermissions } from './import-parts.service'
import { type TotalScoreRule, loadStageContext } from './import-promotion-context.service'
import {
  type HeldRow,
  ROW_UNAVAILABLE,
  type RowResolution,
  claimBatchForResolution,
  claimHeldRow,
  invalidFields,
  readFileValues,
} from './import-review.service'
import {
  findStagePerson,
  promoteStageInTx,
  readStageBaseline,
} from './import-stage-promotion.service'
import { intakeField } from './import-validation.service'
import { differingFields, splitRejected } from './participant-match'

type Batch = Awaited<ReturnType<typeof requireBatchWithHeaders>>
type Detail = NonNullable<ImportRowReviewResponse['scoreDetail']>[number]

// Holds a reviewer can settle: the answers and score of the stage, or its date.
const resolvable = new Set([
  'STAGE_CHANGED',
  'STAGE_DATE_MISSING',
  'STAGE_DATE_OUTSIDE_ENROLLMENT',
  'TOTAL_SCORE_MISMATCH',
])
// A date hold names the stage date as the field to settle.
const dateHolds = new Set(['STAGE_DATE_MISSING', 'STAGE_DATE_OUTSIDE_ENROLLMENT'])
const nextStep: Record<string, string> = {
  STAGE_CONSENT_MISSING: 'Consent is not recorded in the file, so upload a corrected file.',
  STAGE_IDENTITY_MISMATCH:
    'The survey row does not match the participant, so upload a corrected file.',
  STAGE_DATE_MISSING: 'Type the stage date.',
  STAGE_DATE_OUTSIDE_ENROLLMENT: "Type a stage date within the participant's enrollment.",
}
const defaultStep = 'Open the import again to see where it stands, or upload a corrected file.'

// The error a row that cannot be settled here answers with, as a row Phase 1 still sends to review does.
const stillHeld = (rowNumber: number, code: string) =>
  new ConflictException({
    message: `Row ${rowNumber} still needs review. ${nextStep[code] ?? defaultStep}`,
    code,
  })

// The stage context of a batch whose rows were reviewed, which a held row can only come from.
async function stageContext(tx: Tx, actor: ApplicationIdentity, batch: Batch) {
  const { reviewedById, parentBatchId } = batch
  const context =
    reviewedById && parentBatchId
      ? await loadStageContext(
          tx,
          actor,
          {
            id: batch.id,
            projectId: batch.projectId,
            formId: batch.formId,
            formVersion: batch.formVersion,
            mappingRevision: batch.mappingRevision,
            validationRevision: batch.validationRevision,
            reviewedById,
          },
          parentBatchId,
        )
      : undefined
  if (!context?.fields || !context.stageForm) {
    throw new ConflictException('The stage form version is unavailable.')
  }
  return { ...context, fields: context.fields, stageForm: context.stageForm }
}

/** Loads a stage row waiting for review: PATHWAYS holds the person's latest answers to the stage form. */
export async function loadHeldStageRow(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: Batch,
  rowId: string,
): Promise<HeldRow> {
  if (!UUID_PATTERN.test(rowId)) throw new NotFoundException(ROW_UNAVAILABLE)
  const row = await tx.dataImportRow.findFirst({
    where: {
      id: rowId.toLowerCase(),
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      importBatchId: batch.id,
    },
    select: {
      id: true,
      rowNumber: true,
      status: true,
      rawData: true,
      normalizedData: true,
      processingErrorCode: true,
      validationErrors: true,
      resolvedAt: true,
    },
  })
  if (!row) throw new NotFoundException(ROW_UNAVAILABLE)
  if (
    (row.status !== 'UNPROCESSED' && row.status !== 'INVALID') ||
    row.resolvedAt ||
    (row.status === 'UNPROCESSED' && !row.processingErrorCode)
  ) {
    throw new ConflictException('This row is not waiting for review.')
  }
  const context = await stageContext(tx, actor, batch)
  const { stageForm } = context
  const fieldRows = context.fields
  const fields = fieldRows.map(intakeField)
  const uploadDate = currentBusinessDate(batch.createdAt)
  const { values: file, source } = await readFileValues(tx, actor, batch, row, fields, uploadDate)
  const person = await findStagePerson(tx, actor, context, row.rowNumber, file)
  const beneficiaryId =
    person.known && person.profile && person.enrollment ? person.known.beneficiaryId : null
  const stored = beneficiaryId
    ? await readStageBaseline(tx, actor, batch.projectId, stageForm.code, beneficiaryId)
    : null
  const baseline = stored ? { enrolledHere: true, identityOnly: false, stored } : null
  const differing = baseline ? differingFields({ formField_form: fieldRows }, file, baseline) : []
  const { kept, rejected } =
    beneficiaryId && differing.length > 0
      ? await splitRejected(tx, actor, beneficiaryId, differing, file)
      : { kept: [], rejected: [] }
  const firstError = (row.validationErrors as Array<{ code?: string }>)[0]?.code
  const reason = (row.status === 'UNPROCESSED' ? row.processingErrorCode : firstError) ?? 'UNKNOWN'
  const { invalid, unusable } = invalidFields(row, fieldRows, file, source)
  if (dateHolds.has(reason)) invalid.add('stage_date')
  return {
    batch,
    row: { id: row.id, rowNumber: row.rowNumber, reason },
    form: null,
    fieldRows,
    fields,
    uploadDate,
    file,
    beneficiaryId,
    baseline,
    changed: new Set(kept.map((item) => item.code)),
    invalid,
    unusable,
    rejected: Object.fromEntries(
      rejected.map((item) => [item.code, baseline?.stored.get(item.code) ?? null]),
    ),
  }
}

/** The answers of a scored stage as the key counts them, for the window that shows how the score was reached. */
export function scoreDetailOf(held: Pick<HeldRow, 'fields' | 'fieldRows' | 'file'>) {
  const rule = held.fields
    .map((item) => item.rule)
    .find((item): item is TotalScoreRule => item?.kind === 'TOTAL_SCORE')
  if (!rule) return {}
  const scoreDetail = rule.questions.map(
    (question): Detail => ({
      code: question.field,
      label: held.fieldRows.find((item) => item.code === question.field)?.label ?? question.field,
      answer: (held.file[question.field] ?? null) as Detail['answer'],
      correct: 'anyAnswer' in question ? 'ANY' : question.answers,
      counted: totalScore({ kind: 'TOTAL_SCORE', questions: [question] }, held.file) === 1,
    }),
  )
  return { scoreDetail }
}

/**
 * Saves a held stage row with the reviewer's values: a new submission, so the earlier one stays in history.
 * A hold that remains (consent, identity or a date outside enrollment) refuses, and the transaction undoes the claim.
 */
export async function resolveHeldStage(
  tx: Tx,
  actor: ApplicationIdentity,
  held: HeldRow,
  resolution: RowResolution,
) {
  requireSurveyImportPermissions(actor)
  const { batch, row } = held
  if (resolution.saveAs !== 'UPDATE') {
    throw new BadRequestException('A survey row can only update the participant.')
  }
  if (!resolvable.has(row.reason)) throw stillHeld(row.rowNumber, row.reason)
  const context = await stageContext(tx, actor, batch)
  const claim = await claimBatchForResolution(tx, batch.id)
  await claimHeldRow(tx, actor, {
    batch,
    rowId: row.id,
    rowNumber: row.rowNumber,
    claim,
    resolution: resolution as unknown as Prisma.InputJsonValue,
  })
  const code = await promoteStageInTx(tx, actor, context, row.id, claim.id, resolution)
  if (code) throw stillHeld(row.rowNumber, code)
  await reconcileBatch(tx, batch.id)
  return { kind: 'PROCESSED' as const }
}
