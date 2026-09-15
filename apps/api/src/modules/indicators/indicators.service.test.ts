import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import { IndicatorsService } from './indicators.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))

const organizationId = '77000000-0000-4000-8000-000000000001'
const projectId = '77000000-0000-4000-8000-000000000002'
const indicatorId = '77000000-0000-4000-8000-000000000003'
const userId = '77000000-0000-4000-8000-000000000004'
const actor: ApplicationIdentity = {
  id: '77000000-0000-4000-8000-000000000005', aal: 'aal2', organizationId, userId,
  fullName: 'Synthetic M&E', roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['monitoring.read', 'indicators.create', 'indicators.update'], assignedProjectIds: [projectId],
}
const row = {
  id: indicatorId, projectId, code: 'SIGNED_JUNE', name: 'Signed movement', description: null,
  unitLabel: 'points', dataSource: 'Verified source', mode: 'MANUAL', numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER', displayPrecision: 4, periodStart: '2026-06-01', periodEnd: '2026-06-30',
  baseline: '-10', target: '10', current: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  measurementId: null, measuredAt: null, measurementSource: null, revision: 1, binding: null, status: 'ACTIVE',
}
const input = {
  code: row.code, name: row.name, unitLabel: row.unitLabel, dataSource: row.dataSource,
  mode: 'MANUAL', numericKind: 'SIGNED_CHANGE', direction: 'HIGHER_IS_BETTER', displayPrecision: 4,
  periodStart: row.periodStart, periodEnd: row.periodEnd, baseline: row.baseline, target: row.target,
}
const tx = {
  project: { findFirst: vi.fn() }, digitalForm: { findFirst: vi.fn() }, formField: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() }, auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(), $executeRaw: vi.fn(),
}
function sqlText(query: unknown) {
  if (Array.isArray(query)) return query.join(' ? ')
  return query && typeof query === 'object' && 'sql' in query ? String(query.sql) : ''
}

/** These are service boundary tests with a mocked transaction, not PostgreSQL/RLS evidence. */
describe('P06 IndicatorsService', () => {
  const service = new IndicatorsService({} as PrismaService)
  beforeEach(() => {
    vi.resetAllMocks()
    boundary.run.mockImplementation(async (_prisma: PrismaService, identity: ApplicationIdentity, permission: string, work: (client: Prisma.TransactionClient, current: ApplicationIdentity) => Promise<unknown>) => {
      if (!identity.permissions.includes(permission)) throw new ForbiddenException()
      return work(tx as unknown as Prisma.TransactionClient, identity)
    })
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$executeRaw.mockResolvedValue(1)
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query)
      if (sql.includes('count(*)')) return [{ count: 0n }]
      if (sql.includes('computed.payload')) return [{ ...row }]
      return []
    })
  })
  it('scopes definition reads and returns an exact missing state rather than invented zero', async () => {
    await expect(service.list(actor, projectId)).resolves.toMatchObject([{ id: indicatorId, current: { state: 'MISSING', value: null }, contractVersion: 'p06.v1' }])
    expect(boundary.run).toHaveBeenCalledWith(expect.anything(), actor, 'monitoring.read', expect.any(Function))
    expect(tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [expect.objectContaining({ organizationId }), { id: projectId }] } }))
  })
  it('fails closed on missing scope and on a role without management permission', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(actor, projectId, indicatorId)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create({ ...actor, permissions: ['monitoring.read'] }, projectId, input)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects client-supplied authority, unsupported SQL and conflicting derived/manual inputs', async () => {
    for (const extra of [{ role: 'SYSTEM_ADMINISTRATOR' }, { formula: 'SELECT secret' }, { currentValue: '3' }]) {
      await expect(service.create(actor, projectId, { ...input, ...extra })).rejects.toBeInstanceOf(BadRequestException)
    }
    await expect(service.create(actor, projectId, { ...input, mode: 'DERIVED' })).rejects.toBeInstanceOf(BadRequestException)
    expect(boundary.run).not.toHaveBeenCalled()
  })
  it('writes only a definition plus its mandatory redacted audit in the authorized transaction', async () => {
    await service.create(actor, projectId, input)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain('INSERT INTO pathways.project_indicators')
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PROJECT_INDICATOR_CREATED', actorUserId: userId, organizationId, projectId }) }))
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('Verified source')
  })
  it('checks the pinned published form version before inserting a derived binding', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(null)
    await expect(service.create(actor, projectId, {
      ...input, mode: 'DERIVED', binding: { recipe: 'FORM_NUMERIC_AVERAGE', formId: '77000000-0000-4000-8000-000000000008', formVersion: 2, fieldId: '77000000-0000-4000-8000-000000000009' },
    })).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects stale label edits without writing an audit success', async () => {
    tx.$executeRaw.mockResolvedValue(0)
    await expect(service.update(actor, projectId, indicatorId, { name: 'Updated label', expectedRevision: 1 })).rejects.toBeInstanceOf(ConflictException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('makes a same-key/same-input measurement retry read-only; conflicting reuse fails', async () => {
    const measurement = { clientMeasurementId: '77000000-0000-4000-8000-000000000010', periodStart: row.periodStart, periodEnd: row.periodEnd, value: '-2.5000', source: 'Reviewed register' }
    const hash = createHash('sha256').update(JSON.stringify({ projectId, indicatorId, periodStart: row.periodStart, periodEnd: row.periodEnd, value: '-2.5', source: measurement.source, note: null, correctsMeasurementId: null, correctionReason: null })).digest('hex')
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query)
      if (sql.includes('request_hash AS hash')) return [{ hash }]
      if (sql.includes('computed.payload')) return [{ ...row }]
      return []
    })
    await service.measure(actor, projectId, indicatorId, measurement)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    await expect(service.measure(actor, projectId, indicatorId, { ...measurement, value: '-2' })).rejects.toBeInstanceOf(ConflictException)
  })
  it('requires correction of the current leaf and rejects a different reporting period', async () => {
    const measurement = { clientMeasurementId: '77000000-0000-4000-8000-000000000010', periodStart: row.periodStart, periodEnd: row.periodEnd, value: '2', source: 'Verified source', correctsMeasurementId: '77000000-0000-4000-8000-000000000011', correctionReason: 'A corrected source entry' }
    await expect(service.measure(actor, projectId, indicatorId, measurement)).rejects.toBeInstanceOf(ConflictException)
    await expect(service.measure(actor, projectId, indicatorId, { ...measurement, periodEnd: '2026-06-29' })).rejects.toBeInstanceOf(ConflictException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects an over-broad database response and translates a query timeout without data', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) => sqlText(query).includes('computed.payload') ? [{ ...row, beneficiaryId: 'must-not-escape' }] : [])
    await expect(service.list(actor, projectId)).rejects.toBeInstanceOf(ServiceUnavailableException)
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('computed.payload')) throw { code: 'P2010', meta: { code: '57014' } }
      return []
    })
    await expect(service.list(actor, projectId)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
