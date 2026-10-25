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
} from '../beneficiaries/beneficiary-registration.helpers'
import {
  BeneficiaryRegistrationService,
  type RegistrationImportForm,
} from '../beneficiaries/beneficiary-registration.service'
import { reconcileBatch } from './import-claims.service'
import { registrationMatchesByIdentifier } from './import-promotion-context.service'
import {
  claimBatchForResolution,
  lockResolvableBatch,
  promoteClaimedRow,
} from './import-review.service'
import { matchedValues } from './import-row-promotion.service'
import { safeRawData } from './imports.helpers'
import { matchParticipant, rejectedBaseline } from './participant-match'

// The ceiling a verified transaction may have; the rows share one processing claim that outlives it.
const APPROVAL_TRANSACTION_TIMEOUT_MS = 30_000
const HELD_CODE = 'GUARDIAN_CONSENT_REQUIRED'
const NO_LONGER_APPROVABLE = 'This row can no longer be approved here.'

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
            status: true,
            processingErrorCode: true,
            resolvedAt: true,
            normalizedData: true,
          },
          orderBy: { rowNumber: 'asc' },
        })
        if (
          batch.form.formType !== 'BENEFICIARY_REGISTRATION' ||
          rows.length !== ids.length ||
          rows.some(
            (row) =>
              row.status !== 'UNPROCESSED' ||
              row.processingErrorCode !== HELD_CODE ||
              row.resolvedAt !== null,
          )
        ) {
          throw new ConflictException(
            'Only held minors waiting for guardian consent can be approved.',
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
          const stored = safeRawData(row.normalizedData as Prisma.JsonValue)
          promotable.push({
            id: row.id,
            values: await this.approvalValues(tx, actor, form, stored, byIdentifier),
          })
        }
        const details = {
          ...(body.guardianName ? { name: body.guardianName } : {}),
          ...(body.consentDate ? { date: body.consentDate } : {}),
          ...(body.note ? { note: body.note } : {}),
        }
        const claim = await claimBatchForResolution(tx, batch.id)
        for (const row of promotable) {
          await promoteClaimedRow(tx, actor, this.registration, {
            batch,
            form,
            rowId: row.id,
            claim,
            resolution: { guardianApproval: true },
            values: row.values,
            guardianConsent: details,
          })
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

  // The values a held row is promoted with: the participant is found again by the client's identifier, as processing does.
  private async approvalValues(
    tx: Tx,
    actor: ApplicationIdentity,
    form: RegistrationImportForm,
    stored: Record<string, unknown>,
    byIdentifier: boolean,
  ) {
    if (!byIdentifier) return stored
    const file = stored as Record<string, NormalizedValue>
    const match = await matchParticipant(tx, actor, { form, values: file })
    // A row whose participant changed since it was held needs the data review instead.
    if (
      match.kind === 'HOLD' ||
      match.kind === 'CHANGED' ||
      (match.kind === 'SAME' && match.enrolledHere)
    ) {
      throw new ConflictException(NO_LONGER_APPROVABLE)
    }
    const kept =
      match.kind === 'SAME'
        ? await rejectedBaseline(tx, actor, form, file, match.beneficiaryId)
        : {}
    const matched = await matchedValues(tx, actor, match, { ...stored, ...kept })
    if (!matched) throw new ConflictException(NO_LONGER_APPROVABLE)
    return matched
  }
}
