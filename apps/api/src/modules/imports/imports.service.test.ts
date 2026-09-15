import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'
import type { StorageService } from '../storage/storage.service'
import { ImportsService, type UploadedImportFile } from './imports.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const batchId = '50000000-0000-4000-8000-000000000005'
const rowId = '60000000-0000-4000-8000-000000000006'
const secondRowId = '60000000-0000-4000-8000-000000000007'
const clientImportId = '70000000-0000-4000-8000-000000000007'
const claimId = '80000000-0000-4000-8000-000000000008'
const now = new Date('2026-09-13T00:00:00.000Z')

const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['imports.read', 'imports.upload', 'imports.review', 'imports.process'],
  assignedProjectIds: [projectId],
}

const file = (patch: Partial<UploadedImportFile> = {}): UploadedImportFile => {
  const buffer = Buffer.from('score\n2.5\n', 'utf8')
  return {
    buffer,
    originalname: 'scores.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    ...patch,
  }
}

const batch = (patch: Record<string, unknown> = {}) => ({
  id: batchId,
  projectId,
  formId,
  formVersion: 1,
  originalFileName: 'scores.csv',
  fileType: 'CSV' as const,
  sourceChecksum: 'a'.repeat(64),
  clientImportId,
  storageBucket: 'uploads',
  storageObjectKey: `organizations/${organizationId}/projects/${projectId}/imports/${batchId}/${'a'.repeat(64)}.csv`,
  storageStatus: 'STORED' as const,
  sourceHeaders: ['score'],
  status: 'MAPPED' as const,
  mappingRevision: 1,
  validationRevision: 0,
  validatedMappingRevision: null,
  processingRevision: 0,
  processingClaimId: null,
  processingClaimedAt: null,
  totalRows: 2,
  validRows: 0,
  invalidRows: 0,
  processedRows: 0,
  unprocessedRows: 0,
  failedRows: 0,
  failureCode: null,
  uploadedById: actorId,
  reviewedById: null,
  uploadedAt: now,
  validatedAt: null,
  processedAt: null,
  updatedAt: now,
  form: { code: 'scores', name: 'Scores', formType: 'OTHER', status: 'PUBLISHED' },
  ...patch,
})

describe('P03 import service', () => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    project: { findFirst: vi.fn() },
    digitalForm: { findFirst: vi.fn() },
    dataImportBatch: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    dataImportRow: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    metadataMapping: { findMany: vi.fn(), createMany: vi.fn() },
    formField: { findMany: vi.fn() },
    formSubmission: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    formResponseValue: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const storage = {
    isConfigured: vi.fn(() => true),
    uploadPrivateFile: vi.fn(),
    downloadPrivateFile: vi.fn(),
  }
  const beneficiaries = { promoteRegistration: vi.fn() }
  let service: ImportsService

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    service = new ImportsService(
      {} as PrismaService,
      storage as unknown as StorageService,
      beneficiaries as unknown as BeneficiariesService,
      { promoteParticipation: vi.fn() } as never,
    )
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([{ id: batchId }])
    tx.$executeRaw.mockResolvedValue(2)
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
    tx.dataImportBatch.update.mockResolvedValue(batch())
    tx.dataImportRow.updateMany.mockResolvedValue({ count: 0 })
  })

  it('rejects unsafe filenames and inconsistent byte metadata before Storage or database access', async () => {
    await expect(
      service.upload(
        actor,
        projectId,
        { formId, clientImportId },
        file({ originalname: '../x.csv' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file({ size: 999 })),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('denies a wrong-project or unpublished form before uploading the private object', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(null)

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.digitalForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId, projectId, status: 'PUBLISHED' }),
      }),
    )
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('rejects a conflicting scoped idempotency key without replacing its object', async () => {
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ sourceChecksum: 'b'.repeat(64) }))

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('returns an identical completed idempotent upload without a second Storage write', async () => {
    const source = file()
    const sourceChecksum = createHash('sha256').update(source.buffer).digest('hex')
    const existing = batch({ sourceChecksum })
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      'clientImportId' in args.where ? existing : batch(),
    )
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([])

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, source),
    ).resolves.toMatchObject({ id: batchId })
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })

  it('persists a recovery-required checkpoint when Storage succeeds and DB finalization fails', async () => {
    const reservation = batch({
      sourceHeaders: [],
      storageStatus: 'RESERVED',
      status: 'UPLOADING',
      mappingRevision: 0,
      totalRows: 0,
    })
    tx.digitalForm.findFirst.mockResolvedValue({ id: formId, version: 1 })
    tx.dataImportBatch.findFirst.mockImplementation(async (args) =>
      'clientImportId' in args.where ? null : reservation,
    )
    tx.dataImportBatch.findUnique.mockResolvedValue(reservation)
    tx.dataImportBatch.create.mockResolvedValue({ id: batchId })
    tx.dataImportRow.createMany.mockRejectedValue(new Error('synthetic transaction failure'))
    storage.uploadPrivateFile.mockResolvedValue({ path: 'private' })

    await expect(
      service.upload(actor, projectId, { formId, clientImportId }, file()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'uploads',
      expect.stringMatching(
        new RegExp(
          `^organizations/${organizationId}/projects/${projectId}/imports/.+/[0-9a-f]{64}\\.csv$`,
        ),
      ),
      expect.any(Buffer),
      'text/csv',
    )
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOVERY_REQUIRED',
          storageStatus: 'RECOVERY_REQUIRED',
        }),
      }),
    )
  })

  it('rejects a stale mapping revision before row validation writes', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue(batch({ mappingRevision: 2 }))
    tx.dataImportBatch.findUnique.mockResolvedValue(batch({ mappingRevision: 2 }))

    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('freezes mapping and validation revisions after processing has started', async () => {
    const started = batch({ processingRevision: 1, status: 'PARTIALLY_PROCESSED' })
    tx.dataImportBatch.findFirst.mockResolvedValue(started)
    tx.dataImportBatch.findUnique.mockResolvedValue(started)

    await expect(
      service.saveMapping(actor, projectId, batchId, {
        expectedMappingRevision: 1,
        mappings: [{ sourceFieldName: 'score', targetFieldCode: 'score', ignored: false }],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.metadataMapping.createMany).not.toHaveBeenCalled()
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('marks duplicate metadata business keys invalid with bounded non-PII errors', async () => {
    const keyField = {
      id: '41000000-0000-4000-8000-000000000004',
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      isRequired: true,
      allowedValues: null,
      minimumValue: new Prisma.Decimal(0),
      maximumValue: new Prisma.Decimal(10),
      minimumDate: null,
      maximumDate: null,
      minimumLength: null,
      maximumLength: null,
      isMetadataKey: true,
    }
    tx.dataImportBatch.findFirst.mockResolvedValue(batch())
    tx.dataImportBatch.findUnique.mockResolvedValue(batch())
    tx.metadataMapping.findMany.mockResolvedValue([
      { sourceFieldName: 'score', status: 'MAPPED', targetField: keyField },
    ])
    tx.formField.findMany.mockResolvedValue([{ code: 'score' }])
    tx.dataImportRow.findMany.mockResolvedValue([
      { id: rowId, rowNumber: 2, rawData: { score: '2.5' } },
      { id: secondRowId, rowNumber: 3, rawData: { score: '2.5' } },
    ])

    await service.validate(actor, projectId, batchId, { expectedMappingRevision: 1 })

    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    const validationWrite = JSON.stringify(tx.$executeRaw.mock.calls[0])
    expect(validationWrite).toContain('DUPLICATE_BUSINESS_KEY')
    expect(validationWrite).not.toContain('2.5')
  })

  it('rejects an active concurrent processing claim', async () => {
    const processing = batch({
      status: 'PROCESSING',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      processingClaimedAt: new Date(Date.now() + 60_000),
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)

    await expect(
      service.process(actor, projectId, batchId, { expectedValidationRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.dataImportRow.findMany).not.toHaveBeenCalled()
  })

  it('recovers expired row claims and clears the batch checkpoint on restart', async () => {
    const processing = batch({
      status: 'PROCESSING',
      validationRevision: 1,
      validatedMappingRevision: 1,
      reviewedById: actorId,
      processingClaimId: claimId,
      processingClaimedAt: new Date(0),
    })
    tx.dataImportBatch.findFirst.mockResolvedValue(processing)
    tx.dataImportBatch.findUnique.mockResolvedValue(processing)
    tx.dataImportRow.findMany.mockResolvedValue([])
    tx.dataImportRow.groupBy.mockResolvedValue([{ status: 'PROCESSED', _count: { _all: 1 } }])
    tx.metadataMapping.findMany.mockResolvedValue([])

    await service.process(actor, projectId, batchId, { expectedValidationRevision: 1 })

    expect(tx.dataImportRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PROCESSING' }),
        data: expect.objectContaining({ status: 'VALID', processingClaimId: null }),
      }),
    )
    expect(tx.dataImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingClaimId: null, processingClaimedAt: null }),
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
