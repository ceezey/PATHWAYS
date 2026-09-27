import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutomaticImportMappingDto } from './imports.dto'
import { ImportsService } from './imports.service'
const state = vi.hoisted(() => ({
  permission: '',
  tx: undefined as unknown,
  actor: undefined as unknown,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _prisma: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    state.permission = permission
    return work(state.tx, state.actor)
  },
}))
const organizationId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const batchId = '50000000-0000-4000-8000-000000000005'
const actor = {
  id: userId,
  userId,
  organizationId,
  roles: ['PROJECT_OFFICER'],
  permissions: ['imports.upload'],
  assignedProjectIds: [projectId],
}
const receipt = {
  batchId,
  mappingRevision: 1,
  mapped: 1,
  pending: 1,
  requiredUnmapped: 0,
  complete: false,
}
const tx = {
  project: { findFirst: vi.fn() },
  dataImportBatch: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}
describe('automatic mapping API authority boundary', () => {
  let service: ImportsService
  beforeEach(() => {
    vi.resetAllMocks()
    state.actor = actor
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.dataImportBatch.findFirst.mockResolvedValue({ id: batchId, projectId, uploadedById: userId })
    tx.$queryRaw.mockResolvedValue([{ receipt }])
    service = new ImportsService({} as never, {} as never, {} as never, {} as never)
  })
  it('uses current upload operation and structurally scopes batch before fixed SQL', async () => {
    expect(
      await service.automaticMapping(actor as never, projectId, batchId, {
        expectedMappingRevision: 0,
      }),
    ).toEqual(receipt)
    expect(state.permission).toBe('imports.upload')
    expect(tx.dataImportBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: batchId, projectId, organizationId } }),
    )
    const sql = tx.$queryRaw.mock.calls[0][0]
    expect(sql.sql).toContain('pathways.p29_auto_map_import')
    expect(sql.values).toEqual([batchId, 0])
  })
  it('denies another uploader before calling SQL', async () => {
    tx.dataImportBatch.findFirst.mockResolvedValue({
      id: batchId,
      projectId,
      uploadedById: 'other',
    })
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('denies inaccessible project before batch retrieval', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.dataImportBatch.findFirst).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([
    { expectedMappingRevision: 2 },
    { expectedMappingRevision: '0' },
    { expectedMappingRevision: 0, ignored: true },
    { expectedMappingRevision: 0, actorId: userId },
  ])('rejects additional choices and invalid revisions %#', async (input) => {
    expect(() =>
      service.automaticMapping(actor as never, projectId, batchId, input as never),
    ).toThrow(BadRequestException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([
    ['22023', BadRequestException],
    ['40001', ConflictException],
    ['42501', ForbiddenException],
    ['42883', ServiceUnavailableException],
  ])('sanitizes SQLSTATE %s', async (code, failure) => {
    tx.$queryRaw.mockRejectedValue({
      code: 'P2010',
      meta: { code, message: 'private sql and data' },
    })
    await expect(
      service.automaticMapping(actor as never, projectId, batchId, { expectedMappingRevision: 1 }),
    ).rejects.toBeInstanceOf(failure)
    try {
      await service.automaticMapping(actor as never, projectId, batchId, {
        expectedMappingRevision: 1,
      })
    } catch (error) {
      expect(String(error)).not.toContain('private')
    }
  })
  it('DTO validation rejects extra fields under the actual whitelist settings', async () => {
    const errors = await validate(
      plainToInstance(AutomaticImportMappingDto, { expectedMappingRevision: 0, target: 'private' }),
      { whitelist: true, forbidNonWhitelisted: true },
    )
    expect(errors.some((error) => error.property === 'target')).toBe(true)
  })
})
