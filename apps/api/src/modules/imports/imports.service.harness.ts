import { afterEach, beforeEach, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import type { StorageService } from '../storage/storage.service'
import { ImportsService, type UploadedImportFile } from './imports.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Tx | undefined,
  operationCalls: [] as Array<{ permission: string; options: unknown }>,
}))

vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work, options) => {
    state.operationCalls.push({ permission, options })
    return work(state.tx, state.actor)
  }),
}))

export const organizationId = '10000000-0000-4000-8000-000000000001'
export const actorId = '20000000-0000-4000-8000-000000000002'
export const projectId = '30000000-0000-4000-8000-000000000003'
export const formId = '40000000-0000-4000-8000-000000000004'
export const batchId = '50000000-0000-4000-8000-000000000005'
export const rowId = '60000000-0000-4000-8000-000000000006'
export const secondRowId = '60000000-0000-4000-8000-000000000007'
export const clientImportId = '70000000-0000-4000-8000-000000000007'
export const claimId = '80000000-0000-4000-8000-000000000008'
export const publisherId = '20000000-0000-4000-8000-0000000000aa'
export const now = new Date('2026-09-13T00:00:00.000Z')
export const testUploadsBucket = 'uploads'

export const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['imports.read', 'imports.upload', 'imports.review', 'imports.process'],
  assignedProjectIds: [projectId],
}

export const file = (patch: Partial<UploadedImportFile> = {}): UploadedImportFile => {
  const buffer = Buffer.from('score\n2.5\n', 'utf8')
  return {
    buffer,
    originalname: 'scores.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    ...patch,
  }
}

export const batch = (patch: Record<string, unknown> = {}) => ({
  id: batchId,
  projectId,
  formId,
  formVersion: 1,
  originalFileName: 'scores.csv',
  fileType: 'CSV' as const,
  sourceChecksum: 'a'.repeat(64),
  clientImportId,
  storageBucket: testUploadsBucket,
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
  createdAt: now,
  uploadedAt: now,
  validatedAt: null,
  processedAt: null,
  updatedAt: now,
  form: {
    code: 'scores',
    name: 'Scores',
    formType: 'OTHER',
    status: 'PUBLISHED',
    publishedById: publisherId,
  },
  ...patch,
})
export const tx = {
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
  beneficiaryActivityParticipation: { findUnique: vi.fn() },
  auditLog: { create: vi.fn(), findFirst: vi.fn() },
}
export const storage = {
  isConfigured: vi.fn(() => true),
  uploadPrivateFile: vi.fn(),
  downloadPrivateFile: vi.fn(),
}
export const beneficiaries = { promoteRegistration: vi.fn() }
export let service: ImportsService
export { state }

export function useImportsHarness() {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('UPLOADS_BUCKET', testUploadsBucket)
    state.actor = actor
    state.tx = tx as unknown as Tx
    state.operationCalls = []
    service = new ImportsService(
      {} as PrismaService,
      storage as unknown as StorageService,
      beneficiaries as unknown as BeneficiaryRegistrationService,
      { promoteParticipation: vi.fn() } as never,
    )
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([{ id: batchId }])
    tx.$executeRaw.mockResolvedValue(2)
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
    tx.dataImportBatch.update.mockResolvedValue(batch())
    tx.dataImportRow.updateMany.mockResolvedValue({ count: 0 })
    afterEach(() => {
      vi.unstubAllEnvs()
    })
  })
}
