import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission, rolePermissions } from '../auth/authorization-policy'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

// Confirming an AUTO_SMART_V2 suggestion is an ordinary manual revision: it goes through
// saveMapping, which the route and the verified operation both bind to imports.review.
const state = vi.hoisted(() => ({ tx: undefined as unknown }))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _prisma: unknown,
    identity: { roles: string[]; permissions: string[] },
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission)) {
      throw new ForbiddenException('Permission denied.')
    }
    return work(state.tx, identity)
  },
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const batchId = '50000000-0000-4000-8000-000000000005'
const fieldId = '60000000-0000-4000-8000-000000000001'
const identity = (
  role: 'PROJECT_OFFICER' | 'MONITORING_AND_EVALUATION_OFFICER',
  userId: string,
) => ({
  id: `auth-${userId}`,
  userId,
  organizationId,
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [projectId],
})
const stored = {
  id: batchId,
  projectId,
  formId: '40000000-0000-4000-8000-000000000004',
  status: 'UPLOADED',
  storageStatus: 'STORED',
  mappingRevision: 1,
  processingRevision: 0,
  sourceHeaders: [{ key: 'column_0001', header: 'Surname', columnIndex: 1 }],
  form: { code: 'f', name: 'F', formType: 'OTHER', status: 'PUBLISHED' },
  totalRows: 1,
  uploadedAt: new Date(0),
  updatedAt: new Date(0),
}

function transaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: batchId }]),
    project: { findFirst: vi.fn().mockResolvedValue({ id: projectId }) },
    dataImportBatch: {
      findFirst: vi.fn().mockResolvedValue(stored),
      findUnique: vi.fn().mockResolvedValue(stored),
      update: vi.fn(),
    },
    dataImportRow: { updateMany: vi.fn() },
    formField: { findMany: vi.fn().mockResolvedValue([{ id: fieldId, code: 'last_name' }]) },
    metadataMapping: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
}

const confirm = {
  expectedMappingRevision: 1,
  mappings: [{ sourceFieldName: 'column_0001', targetFieldCode: 'last_name', ignored: false }],
}

describe('confirming a smart mapping suggestion', () => {
  it('binds the mapping route to imports.review', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ImportsController.prototype.map)).toBe(
      'imports.review',
    )
    expect(Reflect.getMetadata(PERMISSION_KEY, ImportsController.prototype.automaticMapping)).toBe(
      'imports.upload',
    )
  })

  it('denies a Project Officer before any write', async () => {
    const tx = transaction()
    state.tx = tx
    const service = new ImportsService({} as never, {} as never, {} as never, {} as never)
    await expect(
      service.saveMapping(
        identity('PROJECT_OFFICER', 'po-1') as never,
        projectId,
        batchId,
        confirm,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.metadataMapping.createMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('records an M&E confirmation as a new manual revision attributed to the reviewer', async () => {
    const tx = transaction()
    state.tx = tx
    const service = new ImportsService({} as never, {} as never, {} as never, {} as never)
    await service.saveMapping(
      identity('MONITORING_AND_EVALUATION_OFFICER', 'me-1') as never,
      projectId,
      batchId,
      confirm,
    )
    expect(tx.metadataMapping.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId,
          revision: 2,
          sourceFieldName: 'column_0001',
          targetFieldId: fieldId,
          status: 'MAPPED',
        }),
      ],
    })
    // A manual revision never carries automatic suggestion fields.
    const [row] = tx.metadataMapping.createMany.mock.calls[0][0].data
    expect(row).not.toHaveProperty('suggestedFieldId')
    expect(row).not.toHaveProperty('matchScore')
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'me-1',
          action: 'IMPORT_MAPPING_REVISED',
          changes: { revision: 2, mapped: 1, ignored: 0, valueMapped: 0 },
        }),
      }),
    )
  })
})
