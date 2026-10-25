import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type {
  BeneficiaryRegistrationService,
  RegistrationImportForm,
} from '../beneficiaries/beneficiary-registration.service'
import type { ParticipantsService } from '../participants/participants.service'
import { type FieldRow, fieldSelection } from './imports.mapper'

export interface PromotionBatch {
  id: string
  projectId: string
  formId: string
  formVersion: number
  mappingRevision: number
  validationRevision: number
  reviewedById: string
}

export interface ParticipationForm {
  id: string
  version: number
  activityId: string | null
  journeyStageId: string | null
}

/**
 * Read-only promotion context. The per-row path passes only the freshly read batch;
 * a chunk passes the batch, form fields and form definition loaded once per claim.
 */
export interface PromotionContext {
  batch: PromotionBatch
  fields?: FieldRow[]
  participationForm?: ParticipationForm
  registrationForm?: RegistrationImportForm
  // True when every registration row of the batch is matched by the client's identifier.
  matchesByIdentifier?: boolean
}

export type PromotionKind = 'GENERIC' | 'REGISTRATION' | 'PARTICIPATION'

// The registration and participation services a row promotion calls.
export interface PromotionHandlers {
  registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration' | 'readRegistrationForm'>
  participants: Pick<ParticipantsService, 'promoteParticipation'>
}

/** Loads the read-only context shared by every chunk of one claim. */
export async function loadPromotionContext(
  tx: Tx,
  actor: ApplicationIdentity,
  promotion: PromotionHandlers,
  batch: {
    id: string
    projectId: string
    formId: string
    formVersion: number
    mappingRevision: number
    validationRevision: number
    reviewedById: string | null
    form: { formType: string }
  },
): Promise<PromotionContext | undefined> {
  if (!batch.reviewedById) return undefined
  const promotionBatch: PromotionBatch = {
    id: batch.id,
    projectId: batch.projectId,
    formId: batch.formId,
    formVersion: batch.formVersion,
    mappingRevision: batch.mappingRevision,
    validationRevision: batch.validationRevision,
    reviewedById: batch.reviewedById,
  }
  if (batch.form.formType === 'BENEFICIARY_REGISTRATION') {
    const registrationForm = await promotion.registration.readRegistrationForm(
      tx,
      actor,
      batch.projectId,
      batch.formId,
      'IMPORTED_DATASET',
    )
    return registrationForm
      ? {
          batch: promotionBatch,
          registrationForm,
          matchesByIdentifier: await registrationMatchesByIdentifier(
            tx,
            actor,
            promotionBatch,
            registrationForm,
          ),
        }
      : undefined
  }
  const fields = await loadFormFields(tx, actor, promotionBatch)
  if (batch.form.formType !== 'ACTIVITY_MONITORING') return { batch: promotionBatch, fields }
  const participationForm = await loadParticipationForm(tx, actor, promotionBatch)
  return participationForm ? { batch: promotionBatch, fields, participationForm } : undefined
}

/** A batch matches participants by the client's identifier when its form has the field and a column maps to it. */
export async function registrationMatchesByIdentifier(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: PromotionBatch,
  form?: RegistrationImportForm,
) {
  if (!form?.formField_form.some((field) => field.code === 'external_identifier_value'))
    return false
  const mapping = await tx.metadataMapping.findFirst({
    where: {
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      revision: batch.mappingRevision,
      status: 'MAPPED',
      targetField: { code: 'external_identifier_value' },
    },
    select: { id: true },
  })
  return mapping !== null
}

export function loadFormFields(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: Pick<PromotionBatch, 'projectId' | 'formId'>,
) {
  return tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
    },
    select: fieldSelection,
    orderBy: { sequenceNo: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
  })
}

export function loadParticipationForm(tx: Tx, actor: ApplicationIdentity, batch: PromotionBatch) {
  return tx.digitalForm.findFirst({
    where: {
      id: batch.formId,
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      version: batch.formVersion,
      formType: 'ACTIVITY_MONITORING',
      status: 'PUBLISHED',
    },
    select: { id: true, version: true, activityId: true, journeyStageId: true },
  })
}
