import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import {
  type DateOrder,
  IMPORT_ENGINEERING_LIMITS,
  type IntakeField,
  fittingDateOrders,
  normalizeImportedRow,
  proposedEnrollmentDate,
  submissionTimeColumn,
} from '@pathways/imports/server'
import { type ConfirmEnrollmentDatesRequest, isCalculatedRule } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { PrismaService } from '../../prisma/prisma.service'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import {
  requireCreateUnlessIdentityReviewer,
  unresolvedRowValues,
} from './guardian-approval.service'
import { reconcileBatch } from './import-claims.service'
import { loadFormFields, registrationMatchesByIdentifier } from './import-promotion-context.service'
import {
  claimBatchForResolution,
  completeUnchangedRow,
  lockResolvableBatch,
  promoteClaimedRow,
} from './import-review.service'
import { intakeField } from './import-validation.service'
import { safeRawData, safeSourceColumns } from './imports.helpers'

// The ceiling a verified transaction may have, as guardian approval has.
const CONFIRM_TRANSACTION_TIMEOUT_MS = 30_000
const DATE_HOLD = 'ENROLLMENT_DATE_REQUIRED'
type Batch = Awaited<ReturnType<typeof lockResolvableBatch>>
interface HeldRow {
  id: string
  rowNumber: number
  rawData: Prisma.JsonValue
  normalizedData: Prisma.JsonValue
}

const named = (rows: readonly HeldRow[]) =>
  `${rows.length === 1 ? 'Row' : 'Rows'} ${rows.map((row) => row.rowNumber).join(', ')}`

// The time column's date order: its mapping's when it has one, else the one order every value in the batch fits.
async function timeColumnOrder(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: Batch,
  key: string,
  uploadDate: string,
): Promise<DateOrder | null> {
  const mapping = await tx.metadataMapping.findFirst({
    where: {
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      revision: batch.mappingRevision,
      sourceFieldName: key,
      status: 'MAPPED',
    },
    select: { dateOrder: true },
  })
  if (mapping?.dateOrder) return mapping.dateOrder as DateOrder
  const raws = await tx.dataImportRow.findMany({
    where: { organizationId: actor.organizationId, importBatchId: batch.id },
    select: { rawData: true },
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  const orders = fittingDateOrders(
    raws.map((row) => safeRawData(row.rawData)[key]),
    Number(uploadDate.slice(0, 4)),
  )
  return orders.length === 1 ? orders[0] : null
}

// Each row's date proposed from the batch's submission time, or null when it has none.
async function proposedDates(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: Batch,
  rows: readonly HeldRow[],
  uploadDate: string,
): Promise<(string | null)[]> {
  const column = submissionTimeColumn(safeSourceColumns(batch.sourceHeaders))
  if (!column) return rows.map(() => null)
  const times = rows.map((row) => safeRawData(row.rawData)[column.key])
  const year = Number(uploadDate.slice(0, 4))
  const direct = times.map((time) => proposedEnrollmentDate(time, column.header, null, year))
  // Only a text date needs the batch's date order, so the batch is read only then.
  if (direct.every(Boolean)) return direct
  const order = await timeColumnOrder(tx, actor, batch, column.key, uploadDate)
  return times.map((time) => proposedEnrollmentDate(time, column.header, order, year))
}

// The row's values with the confirmed date, its calculated fields such as the age worked out again from it.
function withDate(
  fields: readonly IntakeField[],
  row: HeldRow,
  date: string,
  uploadDate: string,
): Record<string, unknown> {
  const prepared: Record<string, unknown> = {
    ...safeRawData(row.normalizedData),
    enrollment_date: date,
  }
  for (const field of fields) if (isCalculatedRule(field.rule)) prepared[field.code] = null
  const result = normalizeImportedRow(fields, prepared, {}, { uploadDate })
  if (!result.valid) {
    throw new BadRequestException(`Row ${row.rowNumber} cannot take this enrollment date.`)
  }
  return result.values
}

// Confirmation of the enrollment date of imported registration rows held without one.
@Injectable()
export class EnrollmentDateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
  ) {}

  confirm(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    body: ConfirmEnrollmentDatesRequest,
  ): Promise<{ confirmed: number; waiting: number }> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      async (tx, actor) => {
        // The schema compares ids as typed, so a mixed-case duplicate is caught here.
        const ids = body.rowIds.map((id) => id.toLowerCase())
        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException('Row ids must be unique.')
        }
        const batch = await lockResolvableBatch(tx, actor, projectId, batchId)
        const rows = await tx.dataImportRow.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            importBatchId: batch.id,
            id: { in: ids },
          },
          select: {
            id: true,
            rowNumber: true,
            status: true,
            processingErrorCode: true,
            resolvedAt: true,
            rawData: true,
            normalizedData: true,
          },
          orderBy: { rowNumber: 'asc' },
        })
        if (batch.form.formType !== 'BENEFICIARY_REGISTRATION' || rows.length !== ids.length) {
          throw new ConflictException('Only rows waiting for an enrollment date can be confirmed.')
        }
        const notHeld = rows.find(
          (row) =>
            row.status !== 'UNPROCESSED' || row.processingErrorCode !== DATE_HOLD || row.resolvedAt,
        )
        if (notHeld) {
          throw new ConflictException(
            `Row ${notHeld.rowNumber} is not waiting for an enrollment date.`,
          )
        }
        // Every row and date is checked before the first write, so one bad row stops the request.
        const uploadDate = currentBusinessDate(batch.createdAt)
        const dates = body.date
          ? rows.map(() => body.date as string)
          : await proposedDates(tx, actor, batch, rows, uploadDate)
        const unproposed = rows.filter((_, index) => !dates[index])
        if (unproposed.length > 0) {
          const one = unproposed.length === 1
          throw new BadRequestException(
            `${named(unproposed)} ${one ? 'has' : 'have'} no submission time. Set one date for ${one ? 'it' : 'them'}.`,
          )
        }
        const late = rows.filter((_, index) => (dates[index] as string) > uploadDate)
        if (late.length > 0) {
          throw new BadRequestException(
            `${named(late)}: the enrollment date is after the upload date.`,
          )
        }
        const early = rows.filter((row, index) => {
          const birth = safeRawData(row.normalizedData).birth_date
          return typeof birth === 'string' && (dates[index] as string) < birth
        })
        if (early.length > 0) {
          throw new BadRequestException(
            `${named(early)}: the enrollment date is before the birth date.`,
          )
        }
        const form = await this.registration.readRegistrationForm(
          tx,
          actor,
          batch.projectId,
          batch.formId,
          'IMPORTED_DATASET',
        )
        if (!form) throw new ConflictException('The registration form is unavailable.')
        const fields = (await loadFormFields(tx, actor, batch)).map(intakeField)
        const byIdentifier = await registrationMatchesByIdentifier(tx, actor, batch, form)
        // The participant is matched on the final values, so the date and age are applied first.
        const promotable = []
        for (const [index, row] of rows.entries()) {
          const stored = withDate(fields, row, dates[index] as string, uploadDate)
          const found = await unresolvedRowValues(tx, actor, form, {
            rowNumber: row.rowNumber,
            stored,
            byIdentifier,
          })
          requireCreateUnlessIdentityReviewer(actor, { rowNumber: row.rowNumber, ...found })
          promotable.push({ row, ...found })
        }
        const source = body.date ? 'TYPED' : 'SUBMISSION_TIME'
        const claim = await claimBatchForResolution(tx, batch.id)
        let waiting = 0
        for (const { row, unchangedOf, values } of promotable) {
          // The whole value set is kept, as guardian approval of a parked minor promotes it unchanged.
          const resolution = { kind: 'ENROLLMENT_DATE', source, values } as Prisma.InputJsonValue
          const claimInput = { batch, rowId: row.id, rowNumber: row.rowNumber, claim, resolution }
          if (unchangedOf) {
            await completeUnchangedRow(tx, actor, { ...claimInput, beneficiaryId: unchangedOf })
          } else {
            const result = await promoteClaimedRow(tx, actor, this.registration, {
              ...claimInput,
              form,
              matchByIdentifier: byIdentifier,
              values,
            })
            if (result.kind === 'WAITING') waiting += 1
          }
          await writeAuditLog(tx, actor, {
            projectId: batch.projectId,
            action: 'IMPORT_ENROLLMENT_DATE_CONFIRMED',
            entityType: 'DataImportRow',
            entityId: row.id,
            changes: { rowNumber: row.rowNumber, source },
          })
        }
        await reconcileBatch(tx, batch.id)
        return { confirmed: rows.length, waiting }
      },
      { transactionTimeoutMs: CONFIRM_TRANSACTION_TIMEOUT_MS },
    )
  }
}
