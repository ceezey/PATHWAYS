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
  type ResolveImportRowResponse,
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
type ResolveStatus = ResolveImportRowResponse['status']
interface FieldError {
  fieldCode: string
  code: string
  message: string
}

// The same ceiling the registration import transaction has.
const RESOLVE_TRANSACTION_TIMEOUT_MS = 20_000
const ROW_UNAVAILABLE = 'Import row unavailable.'
// A resolved minor waits under this code for a Project Officer, who keeps the resolution and adds guardian consent.
export const GUARDIAN_HOLD = 'GUARDIAN_CONSENT_REQUIRED'
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

// Batch checks a resolve or approval makes under the batch lock, before it reads any row.
export async function lockResolvableBatch(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  expectedValidationRevision?: number,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (
    !['VALIDATED', 'PARTIALLY_PROCESSED', 'PROCESSING'].includes(batch.status) ||
    (expectedValidationRevision !== undefined &&
      batch.validationRevision !== expectedValidationRevision) ||
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
  // Validation normalizes the mapped fields and the unmapped ones with a default or a calculation, so this does too.
  const mappedCodes = new Set(
    mappings.flatMap((mapping) =>
      mapping.status === 'MAPPED' && mapping.targetField ? [mapping.targetField.code] : [],
    ),
  )
  const read = fields.filter(
    (field) => mappedCodes.has(field.code) || !!field.importDefault || isCalculatedRule(field.rule),
  )
  return normalizeImportedRow(read, valuesByFieldCode(mappings, raw), rules, { uploadDate }).values
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
    changed: new Set(
      match.kind === 'CHANGED' ? match.fieldCodes.filter((code) => !systemCodes.has(code)) : [],
    ),
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

export interface BatchClaim {
  id: string
  at: Date
}

/** Moves the batch to PROCESSING under a new claim that the rows promoted in this transaction share. */
export async function claimBatchForResolution(tx: Tx, batchId: string): Promise<BatchClaim> {
  const claim = { id: randomUUID(), at: new Date() }
  await tx.dataImportBatch.update({
    where: { id: batchId },
    data: {
      status: 'PROCESSING',
      processingRevision: { increment: 1 },
      processingClaimId: claim.id,
      processingClaimedAt: claim.at,
      failureCode: null,
    },
  })
  return claim
}

/**
 * Claims one held row under the caller's batch claim. A first claim records its resolution; a row parked for
 * guardian consent (resolution null) keeps the one it has. A second request for the same row fails here.
 */
export async function claimHeldRow(
  tx: Tx,
  actor: ApplicationIdentity,
  input: {
    batch: Pick<BatchHead, 'id' | 'mappingRevision' | 'validationRevision'>
    rowId: string
    rowNumber: number
    claim: BatchClaim
    resolution: Prisma.InputJsonValue | null
  },
) {
  const { batch, claim } = input
  const row = {
    id: input.rowId,
    organizationId: actor.organizationId,
    importBatchId: batch.id,
    mappingRevision: batch.mappingRevision,
    validationRevision: batch.validationRevision,
  }
  const claimColumns = {
    status: 'PROCESSING',
    processingClaimId: claim.id,
    processingClaimedAt: claim.at,
    processingAttempts: { increment: 1 },
  } as const
  const claimed =
    input.resolution === null
      ? await tx.dataImportRow.updateMany({
          where: {
            ...row,
            status: 'UNPROCESSED',
            processingErrorCode: GUARDIAN_HOLD,
            resolvedAt: { not: null },
          },
          data: claimColumns,
        })
      : await tx.dataImportRow.updateMany({
          where: { ...row, status: { in: ['UNPROCESSED', 'INVALID'] }, resolvedAt: null },
          data: {
            ...claimColumns,
            resolutionData: input.resolution,
            resolvedById: actor.userId,
            resolvedAt: claim.at,
            processingErrorCode: null,
          },
        })
  if (claimed.count !== 1) {
    throw new ConflictException(`Row ${input.rowNumber} was already resolved.`)
  }
}

/** Claims a row whose participant is already enrolled with the same details and completes it with no new submission. */
export async function completeUnchangedRow(
  tx: Tx,
  actor: ApplicationIdentity,
  input: Parameters<typeof claimHeldRow>[2] & { beneficiaryId: string },
) {
  await claimHeldRow(tx, actor, input)
  await tx.dataImportRow.update({
    where: { id: input.rowId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      processingErrorCode: null,
      processingClaimId: null,
      processingClaimedAt: null,
      registrationOutcome: 'UNCHANGED',
      matchedBeneficiaryId: input.beneficiaryId,
    },
  })
}

// What a person can do about a row the registration service still sends to review.
const reviewNextStep: Record<string, string> = {
  CONSENT_REQUIRED: 'Consent is not recorded in the file, so upload a corrected file.',
  GUARDIAN_CONSENT_REQUIRED:
    'The participant is under 18 and an existing profile cannot be approved by a Project Officer, so upload a corrected file.',
}
const reviewDefaultStep =
  'Open the import again to see where it stands, or upload a corrected file.'

/**
 * Moves one held row through PROCESSING to PROCESSED under the caller's batch claim.
 * A resolved minor who still lacks guardian consent is parked for a Project Officer instead.
 */
export async function promoteClaimedRow(
  tx: Tx,
  actor: ApplicationIdentity,
  registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration'>,
  input: {
    batch: Pick<BatchHead, 'id' | 'projectId' | 'formId' | 'mappingRevision' | 'validationRevision'>
    form: RegistrationImportForm
    rowId: string
    rowNumber: number
    claim: BatchClaim
    // What the row stores as its resolution, or null for a row parked for guardian consent that already has one.
    resolution: Prisma.InputJsonValue | null
    values: Record<string, unknown>
    guardianConsent?: { name?: string; date?: string; note?: string }
  },
) {
  const { batch, form, rowId, values } = input
  await claimHeldRow(tx, actor, input)
  const result = await registration.promoteRegistration(
    tx,
    actor,
    {
      projectId: batch.projectId,
      formId: batch.formId,
      clientRegistrationId: rowId,
      values,
      source: 'IMPORTED_DATASET',
      validatedById: actor.userId,
      importBatchId: batch.id,
      importRowId: rowId,
      matchByIdentifier: true,
      ...(input.guardianConsent ? { guardianConsent: input.guardianConsent } : {}),
    },
    { form },
  )
  if (result.kind === 'REVIEW') {
    // Only a new participant waits for a Project Officer; linking or updating one needs identity review, which a Project Officer lacks.
    if (
      result.code === GUARDIAN_HOLD &&
      !input.guardianConsent &&
      values.registration_operation === 'CREATE'
    ) {
      await tx.dataImportRow.update({
        where: { id: rowId },
        data: {
          status: 'UNPROCESSED',
          processingErrorCode: GUARDIAN_HOLD,
          processingClaimId: null,
          processingClaimedAt: null,
        },
      })
      return { kind: 'WAITING' as const }
    }
    // A hold the database cannot leave from rolls the whole request back.
    throw new ConflictException({
      message: `Row ${input.rowNumber} still needs review. ${reviewNextStep[result.code] ?? reviewDefaultStep}`,
      code: result.code,
    })
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
        registrationOutcomes[values.registration_operation as keyof typeof registrationOutcomes],
    },
  })
  return result
}

/** Resolves one held row inside the caller's transaction and returns the batch to rest. */
export async function commitResolvedRow(
  tx: Tx,
  actor: ApplicationIdentity,
  registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration'>,
  input: {
    batch: Pick<BatchHead, 'id' | 'projectId' | 'formId' | 'mappingRevision' | 'validationRevision'>
    form: RegistrationImportForm
    rowId: string
    rowNumber: number
    resolution: RowResolution
  },
) {
  const claim = await claimBatchForResolution(tx, input.batch.id)
  const result = await promoteClaimedRow(tx, actor, registration, {
    ...input,
    claim,
    resolution: input.resolution as unknown as Prisma.InputJsonValue,
    values: input.resolution.values,
  })
  await reconcileBatch(tx, input.batch.id)
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
      // The window shows stored participant values, so it needs the same grant as reading a profile.
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')) {
        throw new ForbiddenException('Beneficiary read permission is missing.')
      }
      const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
      const held = await loadHeldRow(tx, actor, this.registration, batch, rowId)
      // A participant who is not enrolled in this project is shown only to a reviewer of identities.
      if (
        held.baseline &&
        !held.baseline.enrolledHere &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.identities.review')
      ) {
        throw new ForbiddenException('Beneficiary identity review permission is missing.')
      }
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
  ): Promise<{ status: ResolveStatus }> {
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
        const final = validateChosen(held, body, choose(held, body))
        const values = await this.promotionValues(tx, actor, held, body, final)
        const result = await commitResolvedRow(tx, actor, this.registration, {
          batch,
          form: held.form,
          rowId: held.row.id,
          rowNumber: held.row.rowNumber,
          resolution: { saveAs: body.saveAs, choices: body.choices, values },
        })
        // A guardian row stays with the Project Officer unless the participant no longer needs guardian consent.
        if (result.kind === 'WAITING' && held.row.reason === GUARDIAN_HOLD) {
          throw new ConflictException(
            `Row ${held.row.rowNumber} still needs guardian consent. A Project Officer must approve it.`,
          )
        }
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
        return { status: result.kind === 'WAITING' ? 'WAITING_FOR_PROJECT_OFFICER' : 'PROCESSED' }
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

  // A file value the reviewer turned down, for the PATHWAYS value, a typed one or a calculated one, is remembered so the next upload does not hold it again.
  private async rememberRejections(
    tx: Tx,
    actor: ApplicationIdentity,
    held: HeldRow,
    body: ResolveImportRowRequest,
  ) {
    // Every changed field that does not take the file value turns that file value down.
    const turnedDown = [...held.changed].filter((code) => (body.choices[code] ?? 'FILE') !== 'FILE')
    if (!held.beneficiaryId || turnedDown.length === 0) return
    await tx.importValueRejection.createMany({
      data: turnedDown.map((code) => ({
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
