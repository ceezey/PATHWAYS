// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  actorId,
  batch,
  batchId,
  beneficiaries,
  claimId,
  projectId,
  rowId,
  service,
  state,
  tx,
  useImportsHarness,
} from './imports.service.harness'

import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'

describe('P03 import service', () => {
  useImportsHarness()

  it('finalizes a processing checkpoint by reconciling status and claim release atomically', async () => {
    const processing = batch({
      status: 'PROCESSING',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingRevision: 2,
      processingClaimId: claimId,
      processingClaimedAt: new Date('2026-09-20T22:58:12.145Z'),
    })
    const finalized = batch({
      status: 'PARTIALLY_PROCESSED',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingRevision: 2,
      processingClaimId: null,
      processingClaimedAt: null,
      processedRows: 1,
      invalidRows: 1,
      processedAt: new Date('2026-09-20T22:58:26.097Z'),
    })

    tx.dataImportBatch.findFirst.mockResolvedValueOnce(processing).mockResolvedValueOnce(finalized)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)
    tx.dataImportRow.groupBy.mockResolvedValue([
      { status: 'PROCESSED', _count: { _all: 1 } },
      { status: 'INVALID', _count: { _all: 1 } },
    ])

    const internals = service as unknown as {
      finishClaim: (
        identity: ApplicationIdentity,
        projectId: string,
        batchId: string,
        claimId: string,
      ) => Promise<unknown>
    }

    await internals.finishClaim(actor, projectId, batchId, claimId)

    expect(tx.dataImportBatch.update).toHaveBeenCalledTimes(1)
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith({
      where: { id: batchId },
      data: expect.objectContaining({
        status: 'PARTIALLY_PROCESSED',
        processedRows: 1,
        invalidRows: 1,
        processingClaimId: null,
        processingClaimedAt: null,
      }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'IMPORT_PROCESSING_CHECKPOINT',
          entityType: 'DataImportBatch',
          entityId: batchId,
        }),
      }),
    )
  })

  it('releases a transaction-failed row for a bounded retry and completes the checkpoint', async () => {
    const internals = service as unknown as {
      claimRows: () => Promise<{
        complete: boolean
        rowIds: string[]
        claimId: string
        registrationHandler: boolean
      }>
      promoteGenericRow: () => Promise<void>
      releaseFailedRow: () => Promise<void>
      finishClaim: () => Promise<unknown>
    }
    vi.spyOn(internals, 'claimRows').mockResolvedValue({
      complete: false,
      rowIds: [rowId],
      claimId,
      registrationHandler: false,
    })
    vi.spyOn(internals, 'promoteGenericRow').mockRejectedValue(new Error('transaction rolled back'))
    const release = vi.spyOn(internals, 'releaseFailedRow').mockResolvedValue()
    const finish = vi.spyOn(internals, 'finishClaim').mockResolvedValue({ status: 'PARTIAL' })

    await service.process(actor, projectId, batchId, { expectedValidationRevision: 1 })

    expect(release).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledOnce()
  })

  it('routes registration rows through the P04 domain handler', async () => {
    const internals = service as unknown as {
      claimRows: () => Promise<{
        complete: boolean
        rowIds: string[]
        claimId: string
        registrationHandler: boolean
      }>
      promoteGenericRow: () => Promise<void>
      promoteRegistrationRow: () => Promise<void>
      finishClaim: () => Promise<unknown>
    }
    vi.spyOn(internals, 'claimRows').mockResolvedValue({
      complete: false,
      rowIds: [rowId],
      claimId,
      registrationHandler: true,
    })
    const generic = vi.spyOn(internals, 'promoteGenericRow').mockResolvedValue()
    const promote = vi.spyOn(internals, 'promoteRegistrationRow').mockResolvedValue()
    vi.spyOn(internals, 'finishClaim').mockResolvedValue({ status: 'PROCESSED' })

    await service.process(actor, projectId, batchId, { expectedValidationRevision: 1 })

    expect(promote).toHaveBeenCalledOnce()
    expect(generic).not.toHaveBeenCalled()
  })

  it('commits a validated registration row only after the P04 domain effects succeed', async () => {
    const processing = batch({
      status: 'PROCESSING',
      mappingRevision: 1,
      validationRevision: 2,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      form: {
        code: 'registration',
        name: 'Registration',
        formType: 'BENEFICIARY_REGISTRATION',
        status: 'PUBLISHED',
      },
    })

    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)
    tx.dataImportRow.findFirst.mockResolvedValue({
      id: rowId,
      rowNumber: 2,
      normalizedData: { beneficiary_code: 'SYN-001' },
    })

    beneficiaries.promoteRegistration.mockResolvedValue({
      kind: 'PROCESSED',
      beneficiaryId: 'beneficiary',
      enrollmentId: 'enrollment',
      submissionId: 'submission',
    })

    const internals = service as unknown as {
      claimRows: () => Promise<{
        complete: boolean
        rowIds: string[]
        claimId: string
        registrationHandler: boolean
      }>
      finishClaim: () => Promise<unknown>
    }
    vi.spyOn(internals, 'claimRows').mockResolvedValue({
      complete: false,
      rowIds: [rowId],
      claimId,
      registrationHandler: true,
    })
    vi.spyOn(internals, 'finishClaim').mockResolvedValue({ status: 'PROCESSED' })

    await service.process(actor, projectId, batchId, { expectedValidationRevision: 2 })

    expect(beneficiaries.promoteRegistration).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ importRowId: rowId, source: 'IMPORTED_DATASET' }),
    )
    expect(tx.dataImportRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rowId },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    )

    expect(state.operationCalls).toEqual([
      {
        permission: 'imports.process',
        options: { transactionTimeoutMs: 20_000 },
      },
    ])
  })

  it('uses a bounded 20-second transaction for ACTIVITY_MONITORING row promotion', async () => {
    const processing = batch({
      status: 'PROCESSING',
      mappingRevision: 1,
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      form: {
        code: 'activity_monitoring',
        name: 'Activity Monitoring',
        formType: 'ACTIVITY_MONITORING',
        status: 'PUBLISHED',
      },
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)
    tx.dataImportRow.findFirst.mockResolvedValue({
      id: rowId,
      rowNumber: 2,
      normalizedData: { beneficiary_code: 'TEST-BEN-001' },
    })
    tx.formSubmission.findUnique.mockResolvedValue({ id: 'submission' })
    tx.beneficiaryActivityParticipation.findUnique.mockResolvedValue({ id: 'participation' })
    tx.dataImportRow.update.mockResolvedValue({ id: rowId })

    const internals = service as unknown as {
      promoteParticipationRow: (
        identity: ApplicationIdentity,
        projectId: string,
        batchId: string,
        rowId: string,
        claimId: string,
        validationRevision: number,
      ) => Promise<void>
    }

    await internals.promoteParticipationRow(actor, projectId, batchId, rowId, claimId, 1)

    expect(state.operationCalls).toEqual([
      {
        permission: 'imports.process',
        options: { transactionTimeoutMs: 20_000 },
      },
    ])
  })

  it('fails closed when processing permission is revoked after the claim', async () => {
    const internals = service as unknown as {
      claimRows: () => Promise<{
        complete: boolean
        rowIds: string[]
        claimId: string
        registrationHandler: boolean
      }>
      promoteGenericRow: () => Promise<void>
      releaseFailedRow: () => Promise<void>
    }
    vi.spyOn(internals, 'claimRows').mockResolvedValue({
      complete: false,
      rowIds: [rowId],
      claimId,
      registrationHandler: false,
    })
    vi.spyOn(internals, 'promoteGenericRow').mockRejectedValue(new ForbiddenException())
    const release = vi.spyOn(internals, 'releaseFailedRow').mockResolvedValue()

    await expect(
      service.process(actor, projectId, batchId, { expectedValidationRevision: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(release).not.toHaveBeenCalled()
  })
})
