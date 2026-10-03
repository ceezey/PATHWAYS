// These existing domain tests isolate receipt transport; dedicated source tests cover its boundary.
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async (
    _tx: unknown,
    operation: string,
    projectId: string,
    sourceId: string | null,
    _key: unknown,
    body: Record<string, unknown>,
  ) => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
      operation,
    )
      ? 'f0000000-0000-4000-8000-000000000002'
      : null,
    generatedValues: {
      timestamp: '2026-09-27T00:00:00.001Z',
      businessDate: '2026-09-27',
      normalizedValue: operation === 'INDICATOR_MEASUREMENT' ? body.value : null,
      requestHash:
        operation === 'INDICATOR_MEASUREMENT'
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(
                JSON.stringify({
                  projectId,
                  indicatorId: sourceId,
                  periodStart: body.periodStart,
                  periodEnd: body.periodEnd,
                  value: body.value,
                  source: body.source,
                  note: body.note ?? null,
                  correctsMeasurementId: body.correctsMeasurementId ?? null,
                  correctionReason: body.correctionReason ?? null,
                }),
              )
              .digest('hex')
          : null,
    },
  }),
  finishRuleSourceOperation: async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }),
  readRuleSourceAcknowledgement: async () => null,
  bootstrapRuleSourceProject: async () => undefined,
}))
import { createHash } from 'node:crypto'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndicatorsService } from './indicators.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))

const organizationId = '77000000-0000-4000-8000-000000000001'
const projectId = '77000000-0000-4000-8000-000000000002'
const indicatorId = '77000000-0000-4000-8000-000000000003'
const userId = '77000000-0000-4000-8000-000000000004'
const actor: ApplicationIdentity = {
  id: '77000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  organizationId,
  userId,
  fullName: 'Synthetic M&E',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['indicators.read', 'indicators.create', 'indicators.update'],
  assignedProjectIds: [projectId],
}
const row = {
  id: indicatorId,
  projectId,
  code: 'SIGNED_JUNE',
  name: 'Signed movement',
  description: null,
  unitLabel: 'points',
  dataSource: 'Verified source',
  mode: 'MANUAL',
  numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 4,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  baseline: '-10',
  target: '10',

  current: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
  revision: 1,
  binding: null,
  status: 'ACTIVE',
}
const input = {
  clientMutationId: 'e0000000-0000-4000-8000-000000000001',
  code: row.code,
  name: row.name,
  unitLabel: row.unitLabel,
  dataSource: row.dataSource,
  mode: 'MANUAL',
  numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 4,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  baseline: row.baseline,
  target: row.target,
}
const tx = {
  project: { findFirst: vi.fn() },
  digitalForm: { findFirst: vi.fn() },
  formField: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
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
    boundary.run.mockImplementation(
      async (
        _prisma: PrismaService,
        identity: ApplicationIdentity,
        permission: string,
        work: (client: Prisma.TransactionClient, current: ApplicationIdentity) => Promise<unknown>,
      ) => {
        if (!identity.permissions.includes(permission)) throw new ForbiddenException()
        return work(tx as unknown as Prisma.TransactionClient, identity)
      },
    )
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
    await expect(service.list(actor, projectId)).resolves.toMatchObject([
      {
        id: indicatorId,
        current: { state: 'MISSING', value: null },

        contractVersion: 'p06.v1',
      },
    ])
    expect(boundary.run).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      'indicators.read',
      expect.any(Function),
    )
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.objectContaining({ organizationId }), { id: projectId }] },
      }),
    )
  })
  it('keeps both project and analytics monitoring contracts free of retired comparison', async () => {
    const [indicator] = await service.readInTransaction(
      tx as unknown as Prisma.TransactionClient,
      actor,
      [projectId],
    )

    expect(indicator).toMatchObject({ id: indicatorId, contractVersion: 'p06.v1' })
    expect(indicator).not.toHaveProperty('projectGoalComparison')
  })
  it('calculates exact indicator progress using its own baseline and target', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query)
      if (sql.includes('computed.payload')) {
        return [
          {
            ...row,
            current: { state: 'AVAILABLE', value: '5', reason: null },
          },
        ]
      }
      return []
    })

    await expect(service.get(actor, projectId, indicatorId)).resolves.toMatchObject({
      target: '10',
      progress: { state: 'AVAILABLE', value: '75' },
    })
  })
  it('fails closed on missing scope and on a role without management permission', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(actor, projectId, indicatorId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(
      service.create({ ...actor, permissions: ['indicators.read'] }, projectId, input),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects client-supplied authority, unsupported SQL and conflicting derived/manual inputs', async () => {
    for (const extra of [
      { role: 'SYSTEM_ADMINISTRATOR' },
      { formula: 'SELECT secret' },
      { currentValue: '3' },
    ]) {
      await expect(service.create(actor, projectId, { ...input, ...extra })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    }
    await expect(
      service.create(actor, projectId, { ...input, mode: 'DERIVED' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(boundary.run).not.toHaveBeenCalled()
  })
  it('writes only a definition plus its mandatory redacted audit in the authorized transaction', async () => {
    await service.create(actor, projectId, input)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain(
      'INSERT INTO pathways.project_indicators',
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_INDICATOR_CREATED',
          actorUserId: userId,
          organizationId,
          projectId,
        }),
      }),
    )
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('Verified source')
  })
  it('uses the same scoped and audited create path for an authorized Project Manager', async () => {
    const manager: ApplicationIdentity = {
      ...actor,
      fullName: 'Synthetic Project Manager',
      roles: ['PROJECT_MANAGER'],
    }
    await service.create(manager, projectId, input)
    expect(boundary.run).toHaveBeenCalledWith(
      expect.anything(),
      manager,
      'indicators.create',
      expect.any(Function),
    )
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.objectContaining({ organizationId }), { id: projectId }] },
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROJECT_INDICATOR_CREATED', actorUserId: userId }),
      }),
    )
  })
  it('checks the pinned published form version before inserting a derived binding', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(null)
    await expect(
      service.create(actor, projectId, {
        ...input,
        mode: 'DERIVED',
        binding: {
          recipe: 'FORM_NUMERIC_AVERAGE',
          formId: '77000000-0000-4000-8000-000000000008',
          formVersion: 2,
          fieldId: '77000000-0000-4000-8000-000000000009',
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects stale label edits without writing an audit success', async () => {
    tx.$executeRaw.mockResolvedValue(0)
    await expect(
      service.update(actor, projectId, indicatorId, {
        clientMutationId: 'e0000000-0000-4000-8000-000000000001',
        name: 'Updated label',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('makes a same-key/same-input measurement retry read-only; conflicting reuse fails', async () => {
    const measurement = {
      clientMeasurementId: '77000000-0000-4000-8000-000000000010',
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      value: '-2.5000',
      source: 'Reviewed register',
    }
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          projectId,
          indicatorId,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          value: '-2.5',
          source: measurement.source,
          note: null,
          correctsMeasurementId: null,
          correctionReason: null,
        }),
      )
      .digest('hex')
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      const sql = sqlText(query)
      if (sql.includes('request_hash AS hash')) return [{ hash }]
      if (sql.includes('computed.payload')) return [{ ...row }]
      return []
    })
    await service.measure(actor, projectId, indicatorId, measurement)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    await expect(
      service.measure(actor, projectId, indicatorId, { ...measurement, value: '-2' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
  it('requires correction of the current leaf and rejects a different reporting period', async () => {
    const measurement = {
      clientMeasurementId: '77000000-0000-4000-8000-000000000010',
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      value: '2',
      source: 'Verified source',
      correctsMeasurementId: '77000000-0000-4000-8000-000000000011',
      correctionReason: 'A corrected source entry',
    }
    await expect(
      service.measure(actor, projectId, indicatorId, measurement),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      service.measure(actor, projectId, indicatorId, { ...measurement, periodEnd: '2026-06-29' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('refuses a project of another organization or outside the assignment before any read or write', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    const measurement = {
      clientMeasurementId: '77000000-0000-4000-8000-000000000010',
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      value: '2',
      source: 'Verified source',
    }
    const update = { clientMutationId: input.clientMutationId, name: 'Other', expectedRevision: 1 }
    await expect(service.list(actor, projectId)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create(actor, projectId, input)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.update(actor, projectId, indicatorId, update)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(
      service.measure(actor, projectId, indicatorId, measurement),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(tx.project.findFirst.mock.calls[0][0].where.AND[0]).toMatchObject({ organizationId })
  })
  it('updates the label of an indicator in an assigned project with its audit', async () => {
    await service.update(actor, projectId, indicatorId, {
      clientMutationId: input.clientMutationId,
      name: 'Updated label',
      expectedRevision: 1,
    })
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain(
      'UPDATE pathways.project_indicators',
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_INDICATOR_LABEL_UPDATED',
          actorUserId: userId,
          organizationId,
          projectId,
        }),
      }),
    )
  })
  it('rejects forged authority fields on an indicator update before any write', async () => {
    for (const extra of [
      { organizationId: 'x' },
      { role: 'SYSTEM_ADMINISTRATOR' },
      { target: '1' },
    ]) {
      await expect(
        service.update(actor, projectId, indicatorId, {
          clientMutationId: input.clientMutationId,
          name: 'Updated label',
          expectedRevision: 1,
          ...extra,
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    }
    expect(boundary.run).not.toHaveBeenCalled()
  })
  it('returns not found for a malformed indicator id and for an indicator outside the project', async () => {
    await expect(service.get(actor, projectId, 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    tx.$queryRaw.mockResolvedValue([])
    await expect(service.get(actor, projectId, indicatorId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
  it('refuses a measurement without the update permission and writes nothing', async () => {
    await expect(
      service.measure({ ...actor, permissions: ['indicators.read'] }, projectId, indicatorId, {
        clientMeasurementId: '77000000-0000-4000-8000-000000000010',
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        value: '2',
        source: 'Verified source',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('rejects a measurement for an indicator id outside the project and a non-numeric value', async () => {
    const measurement = {
      clientMeasurementId: '77000000-0000-4000-8000-000000000010',
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      value: '2',
      source: 'Verified source',
    }
    tx.$queryRaw.mockResolvedValue([])
    await expect(
      service.measure(actor, projectId, '77000000-0000-4000-8000-0000000000ff', measurement),
    ).rejects.toBeInstanceOf(NotFoundException)
    tx.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('computed.payload') ? [{ ...row }] : [],
    )
    await expect(
      service.measure(actor, projectId, indicatorId, { ...measurement, value: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('rejects an over-broad database response and translates a query timeout without data', async () => {
    tx.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('computed.payload')
        ? [{ ...row, beneficiaryId: 'must-not-escape' }]
        : [],
    )
    await expect(service.list(actor, projectId)).rejects.toBeInstanceOf(ServiceUnavailableException)
    tx.$queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes('computed.payload'))
        throw { code: 'P2010', meta: { code: '57014' } }
      return []
    })
    await expect(service.list(actor, projectId)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
