import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import type { PrismaService } from '@app/prisma/prisma.service'
import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import { DashboardsService } from './dashboards.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))

const organizationId = '78000000-0000-4000-8000-000000000001'
const projectId = '78000000-0000-4000-8000-000000000002'
const actor: ApplicationIdentity = {
  id: '78000000-0000-4000-8000-000000000003', aal: 'aal2', organizationId,
  userId: '78000000-0000-4000-8000-000000000004', fullName: 'Synthetic executive',
  roles: ['PROGRAM_MANAGER'], permissions: ['analytics.read', 'monitoring.read', 'beneficiaries.aggregates.read'],
  assignedProjectIds: [projectId],
}
const zero = { state: 'ZERO', value: '0', reason: null }
const suppressed = { state: 'SUPPRESSED', value: null, reason: 'COMPLEMENTARY_SUPPRESSION' }
const monitoringBody = { activities: [], milestones: [], participationRecords: zero, attendingIndividuals: zero, enrolledBeneficiaryRecords: zero, enrolledIndividuals: zero }
const sadddBody = { total: suppressed, sex: [], age: [{ key: '0-9', label: '0-9', metric: suppressed }, { key: 'Unknown', label: 'Unknown', metric: suppressed }], disability: [], completeness: [] }
const tx = { project: { findMany: vi.fn() }, $queryRaw: vi.fn() }
const indicators = { readInTransaction: vi.fn() }
function sqlText(query: unknown) { return Array.isArray(query) ? query.join(' ? ') : query && typeof query === 'object' && 'sql' in query ? String(query.sql) : '' }

/** Database responses are mocked here. Actual suppression and RLS use the SQL runtime suite. */
describe('P06 DashboardsService aggregate-only boundary', () => {
  const service = new DashboardsService({} as PrismaService, indicators as unknown as IndicatorsService)
  beforeEach(() => {
    vi.resetAllMocks()
    boundary.run.mockImplementation(async (_: PrismaService, identity: ApplicationIdentity, permission: string, work: (client: Prisma.TransactionClient, current: ApplicationIdentity) => Promise<unknown>) => {
      if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission)) throw new ForbiddenException()
      return work(tx as unknown as Prisma.TransactionClient, identity)
    })
    tx.project.findMany.mockResolvedValue([{ id: projectId, code: 'P06_A', title: 'Synthetic authorized project' }])
    indicators.readInTransaction.mockResolvedValue([])
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query)
      if (sql.includes('p06_monitoring')) return [{ data: monitoringBody }]
      if (sql.includes('p06_saddd')) return [{ data: sadddBody }]
      return []
    })
  })
  afterEach(() => vi.useRealTimers())
  it.each(['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER', 'GRANT_MANAGER', 'PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)('keeps %s inside server-derived project scope', async (role) => {
    const result = await service.monitoring({ ...actor, roles: [role] }, { periodStart: '2026-06-01', periodEnd: '2026-06-30' })
    expect(result.projects.map((project) => project.id)).toEqual([projectId])
    expect(tx.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101, where: { AND: [expect.objectContaining({ organizationId })] } }))
    expect(result).not.toHaveProperty('beneficiaries')
    if (role === 'GRANT_MANAGER') expect(indicators.readInTransaction).not.toHaveBeenCalled()
  })
  it('rejects Project Officer analytics even if a caller supplies an overbroad permission array', async () => {
    await expect(service.monitoring({ ...actor, roles: ['PROJECT_OFFICER'] }, {})).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('requires the additional SADDD permission and preserves suppressed values as null', async () => {
    await expect(service.saddd({ ...actor, permissions: ['analytics.read'] }, {})).rejects.toBeInstanceOf(ForbiddenException)
    const result = await service.saddd(actor, {})
    expect(result.age.map((bucket) => bucket.metric.value)).toEqual([null, null])
    expect(result.privacy.threshold).toBe(5)
    expect(result.privacy.complementarySuppression).toBe(true)
    expect(result.demographicBasis).toBe('CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT')
  })
  it('refuses extra response fields rather than redacting fetched Beneficiary rows', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) => sqlText(query).includes('p06_saddd') ? [{ data: { ...sadddBody, beneficiaryIds: ['must-not-escape'] } }] : [])
    await expect(service.saddd(actor, {})).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
  it('rejects unapproved cross-filters and over-broad queries before aggregation', async () => {
    await expect(service.saddd(actor, { sex: 'FEMALE' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.monitoring(actor, { periodStart: '2026-01-01', periodEnd: '2027-01-02' })).rejects.toBeInstanceOf(BadRequestException)
    tx.project.findMany.mockResolvedValue(Array.from({ length: 101 }, () => ({ id: projectId, code: 'P', title: 'Synthetic' })))
    await expect(service.monitoring(actor, {})).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('does not distinguish guessed foreign IDs from unavailable project scope', async () => {
    tx.project.findMany.mockResolvedValue([])
    await expect(service.monitoring(actor, { projectId: '78000000-0000-4000-8000-000000000099' })).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('uses the business date rather than UTC for its default month-to-date period', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-30T16:30:00Z'))
    const result = await service.monitoring(actor, {})
    expect(result.periodStart).toBe('2026-07-01')
    expect(result.periodEnd).toBe('2026-07-01')
    expect(result.businessTimeZone).toBe('Asia/Manila')
  })
  it('re-queries each request and carries the current organization into the SQL parameters', async () => {
    await service.monitoring(actor, {})
    await service.monitoring({ ...actor, organizationId: '78000000-0000-4000-8000-000000000098' }, {})
    const calls = tx.$queryRaw.mock.calls.map((call) => call[0]).filter((query) => sqlText(query).includes('p06_monitoring'))
    expect(calls).toHaveLength(2)
    expect(calls[0].values).toContain(organizationId)
    expect(calls[1].values).toContain('78000000-0000-4000-8000-000000000098')
  })
  it('uses a finite database statement deadline and reports timeout as unavailable', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('p06_monitoring')) throw { code: 'P2010', meta: { code: '57014' } }
      return []
    })
    await expect(service.monitoring(actor, {})).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(tx.$queryRaw.mock.calls.some((call) => sqlText(call[0]).includes("statement_timeout','3000'"))).toBe(true)
  })
})
