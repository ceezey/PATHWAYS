import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import type { ApproveGuardianConsentRequest } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import {
  type NormalizedValue,
  businessToday,
  canonicalCode,
} from '../beneficiaries/beneficiary-registration.helpers'
import {
  BeneficiaryRegistrationService,
  type RegistrationImportForm,
} from '../beneficiaries/beneficiary-registration.service'
import { reconcileBatch } from './import-claims.service'
import {
  mayMatchByIdentifier,
  registrationMatchesByIdentifier,
} from './import-promotion-context.service'
import {
  GUARDIAN_HOLD,
  claimBatchForResolution,
  completeUnchangedRow,
  lockResolvableBatch,
  promoteClaimedRow,
} from './import-review.service'
import { matchedValues } from './import-row-promotion.service'
import { safeRawData } from './imports.helpers'
import { matchParticipant, rejectedBaseline } from './participant-match'

// The ceiling a verified transaction may have; the rows share one processing claim that outlives it.
const APPROVAL_TRANSACTION_TIMEOUT_MS = 30_000
const noLongerApprovable = (rowNumber: number) => `Row ${rowNumber} can no longer be approved here.`

// Guardian approval of held minors by a Project Officer assigned to the project.
@Injectable()
export class GuardianApprovalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
  ) {}

  approve(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    body: ApproveGuardianConsentRequest,
  ): Promise<{ approved: number }> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.guardian_consent.approve',
      async (tx, actor) => {
        // The schema compares ids as typed, so a mixed-case duplicate is caught here.
        const ids = body.rowIds.map((id) => id.toLowerCase())
        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException('Row ids must be unique.')
        }
        if (ids.length > 1 && (body.guardianName || body.consentDate || body.note)) {
          throw new BadRequestException(
            'Guardian details can be recorded for one participant at a time.',
          )
        }
        if (body.consentDate && new Date(`${body.consentDate}T00:00:00.000Z`) > businessToday()) {
          throw new BadRequestException('The consent date cannot be in the future.')
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
            resolutionData: true,
            normalizedData: true,
          },
          orderBy: { rowNumber: 'asc' },
        })
        if (batch.form.formType !== 'BENEFICIARY_REGISTRATION' || rows.length !== ids.length) {
          throw new ConflictException(
            'Only held minors waiting for guardian consent can be approved.',
          )
        }
        const notWaiting = rows.find(
          (row) => row.status !== 'UNPROCESSED' || row.processingErrorCode !== GUARDIAN_HOLD,
        )
        if (notWaiting) {
          throw new ConflictException(
            `Row ${notWaiting.rowNumber} is not waiting for guardian consent.`,
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
        const byIdentifier = await registrationMatchesByIdentifier(tx, actor, batch, form)
        // Every row is checked before the first write, so a row that cannot be approved stops the request.
        const promotable = []
        for (const row of rows) {
          promotable.push({
            row,
            ...(await this.approvalValues(tx, actor, form, row, byIdentifier)),
          })
        }
        const details = {
          ...(body.guardianName ? { name: body.guardianName } : {}),
          ...(body.consentDate ? { date: body.consentDate } : {}),
          ...(body.note ? { note: body.note } : {}),
        }
        // Linking or updating a found participant needs grants a Project Officer lacks, so name the row instead of failing the chunk.
        for (const { row, unchangedOf, values } of promotable) {
          if (
            !unchangedOf &&
            values.registration_operation !== 'CREATE' &&
            !mayMatchByIdentifier(actor)
          ) {
            throw new ConflictException(
              `Row ${row.rowNumber} belongs to a participant already in PATHWAYS. A Monitoring and Evaluation Officer must review it first.`,
            )
          }
        }
        const claim = await claimBatchForResolution(tx, batch.id)
        for (const { row, parked, unchangedOf, values } of promotable) {
          const claimInput = { batch, rowId: row.id, rowNumber: row.rowNumber, claim }
          if (unchangedOf) {
            await completeUnchangedRow(tx, actor, {
              ...claimInput,
              resolution: { guardianApproval: true },
              beneficiaryId: unchangedOf,
            })
          } else {
            await promoteClaimedRow(tx, actor, this.registration, {
              ...claimInput,
              form,
              // A reviewer's resolution was made on the client's identifier.
              matchByIdentifier: parked || byIdentifier,
              // A parked row keeps the resolution a reviewer gave it.
              resolution: parked ? null : { guardianApproval: true },
              values,
              guardianConsent: details,
            })
          }
        }
        await reconcileBatch(tx, batch.id)
        await writeAuditLog(tx, actor, {
          projectId: batch.projectId,
          action: 'GUARDIAN_CONSENT_APPROVED',
          entityType: 'DataImportBatch',
          entityId: batch.id,
          changes: { count: rows.length, withDetails: Object.keys(details).length > 0 },
        })
        return { approved: rows.length }
      },
      { transactionTimeoutMs: APPROVAL_TRANSACTION_TIMEOUT_MS },
    )
  }

  // The values a held row is promoted with: a parked row keeps its resolution, else the participant is found again by the client's identifier.
  private async approvalValues(
    tx: Tx,
    actor: ApplicationIdentity,
    form: RegistrationImportForm,
    row: {
      rowNumber: number
      resolvedAt: Date | null
      resolutionData: Prisma.JsonValue
      normalizedData: Prisma.JsonValue
    },
    byIdentifier: boolean,
  ): Promise<{ parked: boolean; unchangedOf?: string; values: Record<string, unknown> }> {
    if (row.resolvedAt) {
      const resolved = (row.resolutionData as { values?: Record<string, unknown> } | null)?.values
      if (!resolved) throw new ConflictException(noLongerApprovable(row.rowNumber))
      return { parked: true, values: resolved }
    }
    const stored = safeRawData(row.normalizedData)
    if (!byIdentifier) {
      // Matched by code, the code is the identity: a taken one is a participant already here, never a reason for a new code.
      const code = canonicalCode(stored.beneficiary_code)
      const taken =
        stored.registration_operation === 'CREATE' && code
          ? await tx.beneficiary.findUnique({
              where: { organizationId_code: { organizationId: actor.organizationId, code } },
              select: { id: true },
            })
          : null
      if (taken) {
        throw new ConflictException(
          `Row ${row.rowNumber} looks like a participant already in PATHWAYS. A Monitoring and Evaluation Officer must review it first.`,
        )
      }
      return { parked: false, values: stored }
    }
    const file = stored as Record<string, NormalizedValue>
    const match = await matchParticipant(tx, actor, { form, values: file })
    // A participant already enrolled with the same details needs no new registration.
    if (match.kind === 'SAME' && match.enrolledHere) {
      return { parked: false, unchangedOf: match.beneficiaryId, values: stored }
    }
    // A row whose participant changed since it was held needs the data review instead.
    if (match.kind === 'HOLD' || match.kind === 'CHANGED') {
      throw new ConflictException(
        `Row ${row.rowNumber} changed since it was held. A Monitoring and Evaluation Officer must review it first.`,
      )
    }
    const kept =
      match.kind === 'SAME'
        ? await rejectedBaseline(tx, actor, form, file, match.beneficiaryId)
        : {}
    const matched = await matchedValues(tx, actor, match, { ...stored, ...kept })
    if (!matched) throw new ConflictException(noLongerApprovable(row.rowNumber))
    return { parked: false, values: matched }
  }
}
