import 'reflect-metadata'

import { ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { hasAtomicPermission } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { GuardianApprovalService } from './guardian-approval.service'
import { ImportReviewService } from './import-review.service'
import { ImportsController } from './imports.controller'
import type { ImportsService } from './imports.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const batchId = '50000000-0000-4000-8000-000000000005'
const rowId = '60000000-0000-4000-8000-000000000001'

const identity = (role: string, permissions: string[]): ApplicationIdentity => ({
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: '20000000-0000-4000-8000-000000000002',
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions,
  assignedProjectIds: [projectId],
})

const reviewer = identity('MONITORING_AND_EVALUATION_OFFICER', [
  'imports.read',
  'imports.review',
  'imports.process',
  'beneficiaries.records.read',
  'beneficiaries.records.register',
])
const projectOfficer = identity('PROJECT_OFFICER', ['imports.read', 'imports.process'])

vi.mock('../../common/authz/authorized-operation', async () => {
  const { ForbiddenException: Forbidden } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(
      async (
        _prisma,
        who: ApplicationIdentity,
        permission,
        work: (tx: unknown, actor: unknown) => unknown,
      ) => {
        if (!hasAtomicPermission(who.roles[0], who.permissions, permission)) {
          throw new Forbidden('Required application permission is missing.')
        }
        return work(fakeTx, who)
      },
    ),
  }
})

// The tx answers the project and batch lookups of one project and finds no row outside it.
const fakeTx = {
  $queryRaw: vi.fn(async (sql: { values: unknown[] }) =>
    sql.values.includes(projectId) ? [{ id: batchId }] : [],
  ),
  project: {
    findFirst: vi.fn(async (args: { where: { AND: [unknown, { id: string }] } }) =>
      args.where.AND[1].id === projectId ? { id: projectId } : null,
    ),
  },
  dataImportBatch: {
    findFirst: vi.fn(async () => ({ id: batchId, projectId })),
    findUnique: vi.fn(async () => ({
      id: batchId,
      projectId,
      status: 'PARTIALLY_PROCESSED',
      mappingRevision: 1,
      validationRevision: 1,
      validatedMappingRevision: 1,
      processingClaimId: null,
      processingClaimedAt: null,
      form: { formType: 'BENEFICIARY_REGISTRATION' },
    })),
    update: vi.fn(),
  },
  dataImportRow: { findFirst: vi.fn(async () => null), updateMany: vi.fn(), update: vi.fn() },
  formField: { findMany: vi.fn() },
  formSubmission: { findFirst: vi.fn() },
  beneficiary: { findFirst: vi.fn() },
  beneficiaryIdentifier: { findUnique: vi.fn() },
  importValueRejection: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
const registration = { readRegistrationForm: vi.fn(), promoteRegistration: vi.fn() }

const controller = new ImportsController(
  {} as ImportsService,
  new ImportReviewService(
    {} as PrismaService,
    registration as unknown as BeneficiaryRegistrationService,
  ),
  new GuardianApprovalService(
    {} as PrismaService,
    registration as unknown as BeneficiaryRegistrationService,
  ),
)
const requestOf = (who: ApplicationIdentity): AuthenticatedRequest => ({ headers: {}, user: who })
const body = { expectedValidationRevision: 1, saveAs: 'NEW', choices: {}, own: {} } as const

const expectUntouched = () => {
  for (const write of [
    fakeTx.dataImportBatch.update,
    fakeTx.dataImportRow.updateMany,
    fakeTx.dataImportRow.update,
    fakeTx.importValueRejection.createMany,
    fakeTx.auditLog.create,
    registration.promoteRegistration,
  ]) {
    expect(write).not.toHaveBeenCalled()
  }
}

beforeEach(() => vi.clearAllMocks())

describe('review and resolve routes', () => {
  it('registers both under imports.review', () => {
    const prototype = ImportsController.prototype as unknown as Record<string, () => void>
    for (const [name, method, path] of [
      ['reviewRow', 'GET', ':batchId/rows/:rowId/review'],
      ['resolveRow', 'POST', ':batchId/rows/:rowId/resolve'],
    ]) {
      expect(RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])]).toBe(method)
      expect(Reflect.getMetadata(PATH_METADATA, prototype[name])).toBe(path)
      expect(Reflect.getMetadata(PERMISSION_KEY, prototype[name])).toBe('imports.review')
    }
  })

  it('registers guardian approval under its own permission, not imports.review', () => {
    const route = (ImportsController.prototype as unknown as Record<string, () => void>)
      .approveGuardians
    expect(RequestMethod[Reflect.getMetadata(METHOD_METADATA, route)]).toBe('POST')
    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe(':batchId/guardian-approvals')
    expect(Reflect.getMetadata(PERMISSION_KEY, route)).toBe(
      'beneficiaries.guardian_consent.approve',
    )
  })

  it('project officer cannot resolve (403)', async () => {
    await expect(
      controller.resolveRow(requestOf(projectOfficer), projectId, batchId, rowId, body),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      controller.reviewRow(requestOf(projectOfficer), projectId, batchId, rowId),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
    expect(fakeTx.dataImportRow.findFirst).not.toHaveBeenCalled()
    expectUntouched()
  })

  it('review without records.read is 403 before any read', async () => {
    const blind = identity('MONITORING_AND_EVALUATION_OFFICER', ['imports.read', 'imports.review'])
    await expect(
      controller.reviewRow(requestOf(blind), projectId, batchId, rowId),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
    expect(fakeTx.dataImportRow.findFirst).not.toHaveBeenCalled()
    expectUntouched()
  })

  it('UPDATE without identities.review is 403', async () => {
    await expect(
      controller.resolveRow(requestOf(reviewer), projectId, batchId, rowId, {
        ...body,
        saveAs: 'UPDATE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(fakeTx.$queryRaw).not.toHaveBeenCalled()
    expect(fakeTx.dataImportRow.findFirst).not.toHaveBeenCalled()
    expectUntouched()
  })

  it('row from another project is 404 before any read', async () => {
    // A batch id that is not in the project named by the route.
    await expect(
      controller.resolveRow(requestOf(reviewer), otherProjectId, batchId, rowId, body),
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      controller.reviewRow(requestOf(reviewer), otherProjectId, batchId, rowId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(fakeTx.dataImportRow.findFirst).not.toHaveBeenCalled()

    // A row id that is not in the batch of the project: the row read is scoped and finds nothing.
    await expect(
      controller.resolveRow(requestOf(reviewer), projectId, batchId, rowId, body),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(fakeTx.dataImportRow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId, projectId, importBatchId: batchId }),
      }),
    )
    for (const read of [
      fakeTx.formField.findMany,
      fakeTx.formSubmission.findFirst,
      fakeTx.beneficiary.findFirst,
      fakeTx.beneficiaryIdentifier.findUnique,
      registration.readRegistrationForm,
    ]) {
      expect(read).not.toHaveBeenCalled()
    }
    expectUntouched()
  })
})
