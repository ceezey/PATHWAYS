import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  type IntakeField,
  type NormalizedImportValue,
  applyIntakeRules,
  normalizeImportedRow,
} from '@pathways/imports/server'
import {
  CONSENT_FIELD_CODES,
  type ImportRowReviewResponse,
  type ResolveImportRowRequest,
  completedYearsAt,
  formDefinitionLimits,
  hasAtomicPermission,
  isCalculatedRule,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { PrismaService } from '../../prisma/prisma.service'
import {
  canonicalIdentifierType,
  normalizeIdentifier,
  writableProfileFields,
} from '../beneficiaries/beneficiary-registration.helpers'
import {
  BeneficiaryRegistrationService,
  type RegistrationImportForm,
} from '../beneficiaries/beneficiary-registration.service'
import { lockBatch, requireBatchWithHeaders } from './import-batches.service'
import { reconcileBatch } from './import-claims.service'
import { loadFormFields } from './import-promotion-context.service'
import { matchedValues, registrationOutcomes } from './import-row-promotion.service'
import { columnRules, intakeField, valuesByFieldCode } from './import-validation.service'
import { safeRawData, stableJson } from './imports.helpers'
import type { FieldRow } from './imports.mapper'
import {
  type Baseline,
  matchParticipant,
  readBaseline,
  rejectedBaseline,
  valueHash,
} from './participant-match'

type Values = Record<string, NormalizedImportValue>
type Choices = ResolveImportRowRequest['choices']
type BatchHead = Awaited<ReturnType<typeof requireBatchWithHeaders>>
interface FieldError {
  fieldCode: string
  code: string
  message: string
}

// The same ceiling the registration import transaction has.
const RESOLVE_TRANSACTION_TIMEOUT_MS = 20_000
const ROW_UNAVAILABLE = 'Import row unavailable.'
// The system sets these, so the reviewer neither sees nor chooses them.
const systemCodes = new Set([
  'registration_operation',
  'beneficiary_code',
  'external_identifier_type',
  'profile_update_fields',
])
const consentCodes: readonly string[] = CONSENT_FIELD_CODES

interface HeldRow {
  batch: BatchHead
  row: { id: string; rowNumber: number; reason: string }
  form: RegistrationImportForm
  fieldRows: FieldRow[]
  fields: IntakeField[]
  uploadDate: string
  file: Values
  beneficiaryId: string | null
  baseline: Baseline | null
  // Codes of the fields whose file value differs from what PATHWAYS holds.
  changed: Set<string>
  // The PATHWAYS value of each field whose file value was rejected before.
  rejected: Record<string, unknown>
}

/** What a resolution stores on the row; promotion reads its final values from here. */
export interface RowResolution {
  saveAs: 'UPDATE' | 'NEW'
  choices: Choices
  values: Values
}

const isBlank = (value: unknown) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)

// The calculated value of each rule field: what PATHWAYS would store, or the age a check compares with.
function calculatedValues(fields: readonly IntakeField[], file: Values, uploadDate: string) {
  const copy: Values = { ...file }
  const provided = new Set<string>()
  for (const field of fields) {
    if (isCalculatedRule(field.rule)) copy[field.code] = null
    else if (!isBlank(file[field.code])) provided.add(field.code)
  }
  applyIntakeRules(fields, copy, provided, uploadDate)
  const calculated: Values = {}
  for (const field of fields) {
    const rule = field.rule
    if (isCalculatedRule(rule)) calculated[field.code] = copy[field.code] ?? null
    else if (rule?.kind === 'AGE_CHECK') {
      const birth = new Date(`${file[rule.birthField]}T00:00:00.000Z`)
      calculated[field.code] = Number.isNaN(birth.getTime())
        ? null
        : completedYearsAt(birth, new Date(`${uploadDate}T00:00:00.000Z`))
    }
  }
  return calculated
}

// The cap a typed value may reach, so a huge Your value is refused before any work is done on it.
function tooLong(dataType: string, value: unknown) {
  if (Array.isArray(value)) {
    return (
      value.length > formDefinitionLimits.multiSelectValues ||
      value.some(
        (item) => typeof item === 'string' && item.length > formDefinitionLimits.textLength,
      )
    )
  }
  const limit =
    dataType === 'LONG_TEXT'
      ? formDefinitionLimits.longTextLength
      : dataType === 'TEXT' || dataType === 'SELECT'
        ? formDefinitionLimits.textLength
        : 64
  return typeof value === 'string' && value.length > limit
}

// Batch checks a resolve makes under the batch lock, before it reads any row.
async function lockResolvableBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  expectedValidationRevision: number,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    !['VALIDATED', 'PARTIALLY_PROCESSED', 'PROCESSING'].includes(batch.status) ||
    batch.validationRevision !== expectedValidationRevision ||
    batch.validatedMappingRevision !== batch.mappingRevision
  ) {
    throw new ConflictException('This import changed. Open the row again.')
  }
  const expiry = new Date(Date.now() - IMPORT_ENGINEERING_LIMITS.processingClaimMilliseconds)
  if (batch.processingClaimId && batch.processingClaimedAt && batch.processingClaimedAt > expiry) {
    throw new ConflictException('Another worker currently owns this import claim.')
  }
  return batch
}

// The values the file brought: stored for a held row, read again from the source cells for an invalid one.
async function readFileValues(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchHead,
  row: { status: string; rawData: Prisma.JsonValue; normalizedData: Prisma.JsonValue },
  fields: readonly IntakeField[],
  uploadDate: string,
) {
  if (row.status === 'UNPROCESSED') return safeRawData(row.normalizedData) as Values
  const mappings = await tx.metadataMapping.findMany({
    where: { importBatchId: batch.id, revision: batch.mappingRevision },
    select: {
      sourceFieldName: true,
      status: true,
      dataType: true,
      valueMap: true,
      dateOrder: true,
      targetField: { select: { code: true, dataType: true } },
    },
    take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
  })
  const raw = safeRawData(row.rawData)
  // A text date column may need every row to settle its date order.
  const needsDateOrder = mappings.some(
    (mapping) =>
      mapping.status === 'MAPPED' &&
      mapping.targetField &&
      (mapping.dataType ?? mapping.targetField.dataType) === 'DATE' &&
      !mapping.dateOrder,
  )
  const raws = needsDateOrder
    ? (
        await tx.dataImportRow.findMany({
          where: { organizationId: actor.organizationId, importBatchId: batch.id },
          select: { rawData: true },
          take: IMPORT_ENGINEERING_LIMITS.maxRows,
        })
      ).map((item) => safeRawData(item.rawData))
    : [raw]
  const rules = columnRules(mappings, raws, Number(uploadDate.slice(0, 4)))
  return normalizeImportedRow(fields, valuesByFieldCode(mappings, raw), rules, { uploadDate })
    .values
}

async function loadHeldRow(
  tx: Tx,
  actor: ApplicationIdentity,
  registration: Pick<BeneficiaryRegistrationService, 'readRegistrationForm'>,
  batch: BatchHead,
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
    (row.status === 'UNPROCESSED' && !row.processingErrorCode) ||
    batch.form.formType !== 'BENEFICIARY_REGISTRATION'
  ) {
    throw new ConflictException('This row is not waiting for review.')
  }
  const form = await registration.readRegistrationForm(
    tx,
    actor,
    batch.projectId,
    batch.formId,
    'IMPORTED_DATASET',
  )
  if (!form) throw new ConflictException('The registration form is unavailable.')
  const fieldRows = await loadFormFields(tx, actor, batch)
  const fields = fieldRows.map(intakeField)
  const uploadDate = currentBusinessDate(batch.createdAt)
  const file = await readFileValues(tx, actor, batch, row, fields, uploadDate)
  const match = await matchParticipant(tx, actor, { form, values: file })
  const beneficiaryId =
    match.kind === 'SAME' || match.kind === 'CHANGED' ? match.beneficiaryId : null
  const baseline = beneficiaryId
    ? await readBaseline(tx, actor, form.projectId, beneficiaryId)
    : null
  const firstError = (row.validationErrors as Array<{ code?: string }>)[0]?.code
  return {
    batch,
    row: {
      id: row.id,
      rowNumber: row.rowNumber,
      reason: (row.status === 'UNPROCESSED' ? row.processingErrorCode : firstError) ?? 'UNKNOWN',
    },
    form,
    fieldRows,
    fields,
    uploadDate,
    file,
    beneficiaryId,
    baseline,
    // The matcher's list already leaves out file values the reviewer rejected before.
    changed: new Set(match.kind === 'CHANGED' ? match.fieldCodes : []),
    rejected:
      beneficiaryId && baseline
        ? await rejectedBaseline(tx, actor, form, file, beneficiaryId, baseline)
        : {},
  }
}

// The values the reviewer's choices settle on, or every reason they cannot.
function choose(held: HeldRow, body: ResolveImportRowRequest) {
  const errors: FieldError[] = []
  const fail = (fieldCode: string, code: string, message: string) =>
    errors.push({ fieldCode, code, message })
  const values: Record<string, unknown> = { ...held.file }
  for (const [code, choice] of Object.entries(body.choices)) {
    const field = held.fields.find((item) => item.code === code)
    if (!field || systemCodes.has(code)) {
      fail(code, 'unknown_field', 'This is not a field the reviewer can set.')
    } else if (choice === 'OWN') {
      if (consentCodes.includes(code))
        fail(code, 'consent_not_editable', 'Consent cannot be typed in.')
      else if (!Object.hasOwn(body.own, code)) fail(code, 'own_required', 'Type your value.')
      else if (tooLong(field.dataType, body.own[code]))
        fail(code, 'too_long', 'The value is too long.')
      else values[code] = body.own[code]
    } else if (choice === 'PATHWAYS') {
      if (body.saveAs === 'NEW')
        fail(code, 'invalid_choice', 'A new participant has no PATHWAYS value.')
      else if (held.baseline?.stored.has(code)) values[code] = held.baseline.stored.get(code)
    }
  }
  // A rejected file value that nobody re-chose keeps what PATHWAYS holds.
  if (body.saveAs === 'UPDATE') {
    for (const [code, kept] of Object.entries(held.rejected)) {
      if (!(code in body.choices)) values[code] = kept
    }
  }
  // A calculated choice is worked out from the final inputs, so it waits for the typed values.
  const calculated = calculatedValues(held.fields, values as Values, held.uploadDate)
  for (const [code, choice] of Object.entries(body.choices)) {
    if (choice !== 'CALCULATED' || !held.fields.some((field) => field.code === code)) continue
    if (calculated[code] == null) fail(code, 'no_calculation', 'PATHWAYS has no calculated value.')
    // A recalculated rule field takes its value when the rules run; a check field takes it now.
    else
      values[code] = isCalculatedRule(held.fields.find((field) => field.code === code)?.rule)
        ? null
        : calculated[code]
  }
  if (body.saveAs === 'UPDATE') {
    for (const code of held.changed) {
      if (!(code in body.choices)) fail(code, 'choice_required', 'Choose the value to keep.')
    }
  }
  if (errors.length > 0) {
    throw new BadRequestException({ message: 'The choices are invalid.', errors })
  }
  return values
}

// Runs the form contract, normalization and intake rules on the chosen values; a typed, file or PATHWAYS choice on a calculated field stands.
function validateChosen(
  held: HeldRow,
  body: ResolveImportRowRequest,
  chosen: Record<string, unknown>,
) {
  const prepared = { ...chosen }
  const fields = held.fields.map((field) => {
    if (!isCalculatedRule(field.rule)) return field
    if (body.choices[field.code] && body.choices[field.code] !== 'CALCULATED') {
      return { ...field, rule: null }
    }
    prepared[field.code] = null
    return field
  })
  const result = normalizeImportedRow(fields, prepared, {}, { uploadDate: held.uploadDate })
  if (!result.valid) {
    throw new BadRequestException({
      message: 'The resolved values are invalid.',
      errors: result.errors,
    })
  }
  return result.values
}

/**
 * Moves a held row through PROCESSING to PROCESSED inside the caller's transaction and returns the batch to rest.
 * The row is claimed first, so a second request for the same row fails here before it writes anything else.
 */
export async function commitResolvedRow(
  tx: Tx,
  actor: ApplicationIdentity,
  registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration'>,
  input: {
    batch: Pick<BatchHead, 'id' | 'projectId' | 'formId' | 'mappingRevision' | 'validationRevision'>
    form: RegistrationImportForm
    rowId: string
    resolution: RowResolution
  },
) {
  const { batch, form, rowId, resolution } = input
  const claimId = randomUUID()
  const claimedAt = new Date()
  const claimed = await tx.dataImportRow.updateMany({
    where: {
      id: rowId,
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      status: { in: ['UNPROCESSED', 'INVALID'] },
      resolvedAt: null,
      mappingRevision: batch.mappingRevision,
      validationRevision: batch.validationRevision,
    },
    data: {
      status: 'PROCESSING',
      resolutionData: resolution as unknown as Prisma.InputJsonValue,
      resolvedById: actor.userId,
      resolvedAt: claimedAt,
      processingClaimId: claimId,
      processingClaimedAt: claimedAt,
      processingAttempts: { increment: 1 },
      processingErrorCode: null,
    },
  })
  if (claimed.count !== 1) throw new ConflictException('This row was already resolved.')
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'PROCESSING',
      processingRevision: { increment: 1 },
      processingClaimId: claimId,
      processingClaimedAt: claimedAt,
      failureCode: null,
    },
  })
  const result = await registration.promoteRegistration(
    tx,
    actor,
    {
      projectId: batch.projectId,
      formId: batch.formId,
      clientRegistrationId: rowId,
      values: resolution.values,
      source: 'IMPORTED_DATASET',
      validatedById: actor.userId,
      importBatchId: batch.id,
      importRowId: rowId,
      matchByIdentifier: true,
    },
    { form },
  )
  // A hold the database cannot leave from rolls the whole resolution back.
  if (result.kind === 'REVIEW') {
    throw new ConflictException({ message: 'The row still needs review.', code: result.code })
  }
  await tx.dataImportRow.update({
    where: { id: rowId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
      registrationOutcome:
        registrationOutcomes[
          resolution.values.registration_operation as keyof typeof registrationOutcomes
        ],
    },
  })
  await reconcileBatch(tx, batch.id)
  return result
}

// Review and resolution of registration rows an import held or found invalid.
@Injectable()
export class ImportReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
  ) {}

  review(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
  ): Promise<ImportRowReviewResponse> {
    return withAuthorizedOperation(this.prisma, identity, 'imports.review', async (tx, actor) => {
      const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
      const held = await loadHeldRow(tx, actor, this.registration, batch, rowId)
      const calculated = calculatedValues(held.fields, held.file, held.uploadDate)
      const profile = held.beneficiaryId
        ? await tx.beneficiary.findFirst({
            where: {
              id: held.beneficiaryId,
              organizationId: actor.organizationId,
              archivedAt: null,
            },
            select: { displayName: true },
          })
        : null
      type Cell = ImportRowReviewResponse['fields'][number]['file']
      return {
        rowId: held.row.id,
        rowNumber: held.row.rowNumber,
        reason: held.row.reason,
        participant:
          held.beneficiaryId && profile
            ? {
                beneficiaryId: held.beneficiaryId,
                clientId: String(held.file.external_identifier_value ?? ''),
                displayName: profile.displayName ?? '',
              }
            : null,
        fields: held.fieldRows
          .filter((field) => !systemCodes.has(field.code))
          .map((field) => ({
            code: field.code,
            label: field.label,
            dataType: field.dataType,
            options: Array.isArray(field.allowedValues) ? (field.allowedValues as string[]) : null,
            pathways: (held.baseline?.stored.get(field.code) ?? null) as Cell,
            file: (held.file[field.code] ?? null) as Cell,
            calculated: (calculated[field.code] ?? null) as Cell,
            changed: held.changed.has(field.code),
          })),
        canAddNew: hasAtomicPermission(
          actor.roles[0],
          actor.permissions,
          'beneficiaries.records.register',
        ),
      }
    })
  }

  resolve(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    body: ResolveImportRowRequest,
  ): Promise<{ status: 'PROCESSED' }> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.review',
      async (tx, actor) => {
        // A resolution registers a participant, so the actor must be able to register one.
        if (
          !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.register')
        ) {
          throw new ForbiddenException('Beneficiary registration permission is missing.')
        }
        if (
          body.saveAs === 'UPDATE' &&
          !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.identities.review')
        ) {
          throw new ForbiddenException('Beneficiary identity review permission is missing.')
        }
        const batch = await lockResolvableBatch(
          tx,
          actor,
          projectId,
          batchId,
          body.expectedValidationRevision,
        )
        const held = await loadHeldRow(tx, actor, this.registration, batch, rowId)
        if (held.row.reason === 'GUARDIAN_CONSENT_REQUIRED') {
          throw new ConflictException('Guardian consent is approved by a project officer.')
        }
        const final = validateChosen(held, body, choose(held, body))
        const values = await this.promotionValues(tx, actor, held, body, final)
        await commitResolvedRow(tx, actor, this.registration, {
          batch,
          form: held.form,
          rowId: held.row.id,
          resolution: { saveAs: body.saveAs, choices: body.choices, values },
        })
        if (body.saveAs === 'UPDATE') await this.rememberRejections(tx, actor, held, body)
        await writeAuditLog(tx, actor, {
          projectId: batch.projectId,
          action: 'IMPORT_ROW_RESOLVED',
          entityType: 'DataImportRow',
          entityId: held.row.id,
          changes: {
            rowNumber: held.row.rowNumber,
            reason: held.row.reason,
            saveAs: body.saveAs,
            choices: body.choices,
          },
        })
        return { status: 'PROCESSED' as const }
      },
      { transactionTimeoutMs: RESOLVE_TRANSACTION_TIMEOUT_MS },
    )
  }

  // The registration values a resolution promotes: a new participant, or the matched one updated or linked.
  private async promotionValues(
    tx: Tx,
    actor: ApplicationIdentity,
    held: HeldRow,
    body: ResolveImportRowRequest,
    final: Values,
  ): Promise<Values> {
    const identifier = (values: Values) =>
      typeof values.external_identifier_value === 'string'
        ? normalizeIdentifier(values.external_identifier_value)
        : ''
    const identifierError = (code: string, message: string) =>
      new BadRequestException({
        message: 'The resolved values are invalid.',
        errors: [{ fieldCode: 'external_identifier_value', code, message }],
      })
    if (body.saveAs === 'NEW') {
      const type = canonicalIdentifierType(final.external_identifier_type)
      if (!identifier(final) || !type) {
        throw identifierError('identifier_required', 'A new participant needs a client ID.')
      }
      const taken = await tx.beneficiaryIdentifier.findUnique({
        where: {
          organizationId_identifierType_normalizedValue: {
            organizationId: actor.organizationId,
            identifierType: type,
            normalizedValue: identifier(final),
          },
        },
        select: { beneficiaryId: true },
      })
      if (taken)
        throw identifierError('identifier_in_use', 'This client ID belongs to a participant.')
      const created = await matchedValues(tx, actor, { kind: 'NEW' }, final)
      return { ...created, profile_update_fields: null } as Values
    }
    if (!held.beneficiaryId || !held.baseline) {
      throw identifierError('no_participant', 'There is no participant to update.')
    }
    if (identifier(final) !== identifier(held.file)) {
      throw identifierError('identifier_locked', 'The client ID is how the participant is found.')
    }
    const profile = await tx.beneficiary.findFirst({
      where: { id: held.beneficiaryId, organizationId: actor.organizationId, archivedAt: null },
      select: { code: true },
    })
    if (!profile) throw new ConflictException('The participant is unavailable.')
    const { stored } = held.baseline
    const updateFields = [...writableProfileFields].filter(
      (code) =>
        (held.changed.has(code) || code in body.choices) &&
        stored.has(code) &&
        stableJson(final[code] ?? null) !== stableJson(stored.get(code) ?? null),
    )
    // Answers that are not profile fields only add a registration to the participant's history.
    return {
      ...final,
      registration_operation: updateFields.length > 0 ? 'UPDATE' : 'LINK',
      beneficiary_code: profile.code,
      profile_update_fields: updateFields.length > 0 ? updateFields : null,
    }
  }

  // A file value the reviewer turned down is remembered, so the next upload does not hold it again.
  private async rememberRejections(
    tx: Tx,
    actor: ApplicationIdentity,
    held: HeldRow,
    body: ResolveImportRowRequest,
  ) {
    const kept = Object.entries(body.choices).filter(
      ([code, choice]) => choice === 'PATHWAYS' && held.changed.has(code),
    )
    if (!held.beneficiaryId || kept.length === 0) return
    await tx.importValueRejection.createMany({
      data: kept.map(([code]) => ({
        organizationId: actor.organizationId,
        projectId: held.batch.projectId,
        beneficiaryId: held.beneficiaryId as string,
        fieldId: held.fieldRows.find((field) => field.code === code)?.id as string,
        valueHash: valueHash(held.file[code]),
        rejectedById: actor.userId,
      })),
      skipDuplicates: true,
    })
  }
}
