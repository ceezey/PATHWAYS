import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type RouteKey,
  type RouteSelection,
  routePolicy,
} from '../../../../web/src/lib/rbac/route-access'
import type { PrismaService } from '../../prisma/prisma.service'
import { type CanonicalRole, rolePermissions } from './authorization-policy'
import type { ApplicationIdentity } from './developer-access'
import { RouteAccessService } from './route-access.service'

const id = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const fixture = (role: CanonicalRole): ApplicationIdentity => ({
  id,
  aal: 'aal2',
  userId: id,
  organizationId: id,
  fullName: 'Synthetic user',
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [id],
})
const tx = {
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  beneficiaryProjectEnrollment: { findFirst: vi.fn() },
}
const transaction = vi.fn(async (_context, work) => work(tx))
const service = new RouteAccessService({
  withVerifiedContext: transaction,
} as unknown as PrismaService)
// Explicit approved CSV route matrix, independent of the route implementation.
const allowed: Record<CanonicalRole, string> = {
  SYSTEM_ADMINISTRATOR:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport analytics activities activity indicators budget monitoring collection imports alerts recommendations rules settingsRules users audit backups transparency transparencyPreview transparencyQueue',
  PROGRAM_MANAGER:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport project analytics budget monitoring transparency transparencyPreview transparencyQueue alerts recommendations users audit',
  GRANT_MANAGER:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport project analytics budget monitoring transparency transparencyPreview transparencyQueue alerts recommendations',
  PROJECT_MANAGER:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport project projectCreate projectEdit analytics activities activity indicators budget monitoring transparency transparencyPreview transparencyQueue beneficiaries beneficiaryCreate beneficiary beneficiaryEdit alerts recommendations users audit beneficiaryReport reportPreview',
  MONITORING_AND_EVALUATION_OFFICER:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport project analytics activities activity evidence indicators budget monitoring beneficiaries beneficiaryCreate beneficiary beneficiaryEdit collection manualEntry formCreate formEntry imports alerts recommendations beneficiaryReport reportPreview',
  PROJECT_OFFICER:
    'dashboard unauthorized projects reports surveyReport forms form profile settings projectReport indicatorReport activities activity budget beneficiaries beneficiaryCreate beneficiary beneficiaryEdit collection manualEntry formCreate formEntry imports beneficiaryReport reportPreview',
}
const select = (route: RouteKey): RouteSelection => ({
  route,
  ...Object.fromEntries([...routePolicy[route].path.matchAll(/:(\w+)/g)].map((m) => [m[1], id])),
})
beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(tx)) model.findFirst.mockResolvedValue({ id })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('central policy: every locked role against every protected entry route', () => {
  for (const role of Object.keys(allowed) as CanonicalRole[]) {
    for (const route of Object.keys(routePolicy) as RouteKey[]) {
      it(`${role} / ${route}`, async () => {
        const identity = fixture(role)
        const selected = select(route)
        const result = service.check(identity, selected)
        if (allowed[role].split(' ').includes(route)) {
          expect(await result).toEqual({
            route,
            authorization: 'database-verified',
            beneficiaryAccess: ['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(role)
              ? 'aggregate-only'
              : 'records-or-none',
          })
          if (!selected.projectId && !selected.activityId && !selected.beneficiaryId) {
            expect(transaction).not.toHaveBeenCalled()
          }
        } else await expect(result).rejects.toMatchObject({ status: 403 })
      })
    }
  }
})

describe('bounded development-only route-check failure evidence', () => {
  const privateContent = 'SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_APPEAR'
  let output: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    output = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })
  const fail = () => service.check(fixture('PROJECT_MANAGER'), { route: 'project', projectId: id })

  it.each([
    'P1000',
    'P1001',
    'P1002',
    'P1008',
    'P1017',
    'P2010',
    'P2021',
    'P2022',
    'P2024',
    'P2028',
  ])('keeps only reviewed %s code and fixed operation stage', async (code) => {
    const error = Object.assign(new Error(privateContent), {
      code,
      meta: privateContent,
      cause: privateContent,
    })
    tx.project.findFirst.mockRejectedValue(error)
    await expect(fail()).rejects.toMatchObject({
      status: 503,
      message: 'Route verification is temporarily unavailable.',
    })
    expect(output).toHaveBeenCalledExactlyOnceWith({
      event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
      stage: 'PROJECT_READ',
      reason: code,
      ...(code === 'P2028' ? { transactionFailure: 'UNCLASSIFIED' } : {}),
    })
    expect(JSON.stringify(output.mock.calls)).not.toContain(privateContent)
  })

  it.each(['start', 'completion'])(
    'distinguishes transaction %s from scoped object work',
    async (phase) => {
      transaction.mockImplementationOnce(async (_context, work) => {
        if (phase === 'completion') await work(tx)
        throw { code: 'P2028', message: privateContent }
      })
      await expect(fail()).rejects.toMatchObject({ status: 503 })
      expect(output).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage: phase === 'start' ? 'CONTEXT_OR_TRANSACTION' : 'TRANSACTION_COMPLETION',
        reason: 'P2028',
        transactionFailure: 'UNCLASSIFIED',
      })
    },
  )

  it.each([
    ['project', 'project', 'PROJECT_READ'],
    ['activity', 'projectActivity', 'ACTIVITY_READ'],
    ['beneficiary', 'beneficiaryProjectEnrollment', 'BENEFICIARY_SCOPE_READ'],
  ] as const)(
    'classifies %s scope failure without disclosing selectors',
    async (route, model, stage) => {
      tx[model].findFirst.mockRejectedValue({ code: 'P2010', meta: privateContent })
      await expect(service.check(fixture('PROJECT_MANAGER'), select(route))).rejects.toMatchObject({
        status: 503,
      })
      expect(output).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage,
        reason: 'P2010',
      })
    },
  )

  it.each(['production', 'test'])('emits nothing in %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    tx.project.findFirst.mockRejectedValue({ code: 'P2028' })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    expect(output).not.toHaveBeenCalled()
  })

  it('never evaluates a code getter or emits an arbitrary provider code', async () => {
    const getter = vi.fn(() => privateContent)
    const error = Object.defineProperty(new Error(privateContent), 'code', { get: getter })
    tx.project.findFirst
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce({ code: privateContent })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    expect(getter).not.toHaveBeenCalled()
    for (const [event] of output.mock.calls) {
      expect(event).toEqual({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage: 'PROJECT_READ',
        reason: 'CHECK_FAILED',
      })
    }
    expect(output).toHaveBeenCalledTimes(2)
  })

  it('does not label successful access or expected permission denial as an outage', async () => {
    await expect(fail()).resolves.toHaveProperty('route', 'project')
    await expect(
      service.check({ ...fixture('PROJECT_MANAGER'), permissions: [] }, { route: 'dashboard' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(output).not.toHaveBeenCalled()
  })

  it('still denies when the diagnostic sink fails', async () => {
    output.mockImplementation(() => {
      throw new Error(privateContent)
    })
    tx.project.findFirst.mockRejectedValue({ code: 'P2028' })
    await expect(fail()).rejects.toMatchObject({
      status: 503,
      message: 'Route verification is temporarily unavailable.',
    })
  })

  it.each([
    ['Unable to start a transaction in the given time.', 'ACQUISITION_TIMEOUT'],
    [
      'Transaction already closed: A commit cannot be executed on an expired transaction.',
      'EXECUTION_EXPIRED',
    ],
  ])(
    'preserves the fixed response while classifying transaction failure %#',
    async (detail, kind) => {
      tx.project.findFirst.mockRejectedValue({
        code: 'P2028',
        meta: { error: detail },
        message: privateContent,
      })
      await expect(fail()).rejects.toMatchObject({
        status: 503,
        message: 'Route verification is temporarily unavailable.',
      })
      expect(output).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage: 'PROJECT_READ',
        reason: 'P2028',
        transactionFailure: kind,
      })
    },
  )
})
describe('same-request authority and relational object scope', () => {
  it.each([
    ['MONITORING_AND_EVALUATION_OFFICER', 'alerts', 'alerts.read'],
    ['MONITORING_AND_EVALUATION_OFFICER', 'recommendations', 'recommendations.read'],
    ['GRANT_MANAGER', 'alerts', 'alerts.read'],
    ['GRANT_MANAGER', 'recommendations', 'recommendations.read'],
  ] as const)('requires the exact read grant: %s / %s', async (role, route, permission) => {
    const identity = fixture(role)
    await expect(service.check(identity, { route })).resolves.toHaveProperty('route', route)
    await expect(
      service.check(
        { ...identity, permissions: identity.permissions.filter((code) => code !== permission) },
        { route },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
  it.each([
    ['SYSTEM_ADMINISTRATOR', 'dashboard'],
    ['PROJECT_OFFICER', 'collection'],
    ['MONITORING_AND_EVALUATION_OFFICER', 'imports'],
    ['MONITORING_AND_EVALUATION_OFFICER', 'reports'],
    ['SYSTEM_ADMINISTRATOR', 'users'],
  ] as const)(
    'uses the freshly guard-resolved context without a duplicate transaction: %s / %s',
    async (role, route) => {
      await expect(service.check(fixture(role), { route })).resolves.toHaveProperty('route', route)
      expect(transaction).not.toHaveBeenCalled()
    },
  )
  it.each(['id', 'userId', 'organizationId'] as const)(
    'rejects malformed server authority %s before a transaction',
    async (field) => {
      await expect(
        service.check(
          { ...fixture('SYSTEM_ADMINISTRATOR'), [field]: 'fabricated' },
          { route: 'dashboard' },
        ),
      ).rejects.toMatchObject({ status: 403 })
      expect(transaction).not.toHaveBeenCalled()
    },
  )
  it.each([
    { route: 'dashboard', organizationId: id },
    { route: 'project', projectId: 'fabricated' },
    { route: 'dashboard', roles: ['SYSTEM_ADMINISTRATOR'] },
    { route: 'unknown' },
    { route: 'imports', mode: 'unsafe' },
  ])('rejects altered selection without a transaction %#', async (input) => {
    await expect(service.check(fixture('SYSTEM_ADMINISTRATOR'), input)).rejects.toMatchObject({
      status: 403,
    })
    expect(transaction).not.toHaveBeenCalled()
  })
  it('rejects AAL1, missing active permissions and unknown roles', async () => {
    await expect(
      service.check(
        { ...fixture('SYSTEM_ADMINISTRATOR'), aal: 'aal1' } as unknown as ApplicationIdentity,
        { route: 'dashboard' },
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.check(
        { ...fixture('SYSTEM_ADMINISTRATOR'), permissions: [] },
        { route: 'dashboard' },
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      service.check(
        { ...fixture('SYSTEM_ADMINISTRATOR'), roles: ['UNREVIEWED'] } as ApplicationIdentity,
        { route: 'dashboard' },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(transaction).not.toHaveBeenCalled()
  })
  it.each(['PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER', 'GRANT_MANAGER'] as const)(
    'requires current project assignment: %s',
    async (role) => {
      const identity = fixture(role)
      await service.check(identity, { route: 'project', projectId: id })
      expect(tx.project.findFirst).toHaveBeenCalledWith({
        where: { AND: [{ organizationId: id, archivedAt: null, id: { in: [id] } }, { id }] },
        select: { id: true },
      })
      tx.project.findFirst.mockResolvedValue(null)
      await expect(
        service.check({ ...identity, assignedProjectIds: [] }, { route: 'project', projectId: id }),
      ).rejects.toMatchObject({ status: 404 })
      expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0].id.in).toEqual([])
    },
  )
  it('keeps administrator organization scope and manager portfolio scope', async () => {
    await service.check(fixture('SYSTEM_ADMINISTRATOR'), {
      route: 'activity',
      projectId: other,
      activityId: id,
    })
    expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0]).toEqual({
      organizationId: id,
      archivedAt: null,
    })
    await service.check(fixture('PROGRAM_MANAGER'), { route: 'project', projectId: other })
    expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0].OR[1]).toEqual({
      program: { organizationId: id, managerUserId: id, archivedAt: null },
    })
  })
  it('rejects changed activity parent and non-enrolled Beneficiary', async () => {
    tx.projectActivity.findFirst.mockResolvedValue(null)
    await expect(
      service.check(fixture('PROJECT_MANAGER'), {
        route: 'activity',
        projectId: id,
        activityId: other,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.projectActivity.findFirst.mock.lastCall?.[0].where).toEqual({
      id: other,
      projectId: id,
      organizationId: id,
      archivedAt: null,
    })
    tx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
    await expect(
      service.check(fixture('PROJECT_MANAGER'), {
        route: 'beneficiary',
        beneficiaryId: other,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.beneficiaryProjectEnrollment.findFirst.mock.lastCall?.[0]).toMatchObject({
      where: {
        organizationId: id,
        beneficiaryId: other,
        beneficiary: { organizationId: id, archivedAt: null },
        project: { organizationId: id, archivedAt: null },
      },
      select: { id: true },
    })
  })
  it('binds beneficiary route verification to the selected authorized project', async () => {
    await service.check(fixture('PROJECT_OFFICER'), {
      route: 'beneficiary',
      beneficiaryId: other,
      projectId: id,
    })
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ organizationId: id, archivedAt: null, id: { in: [id] } }, { id }] },
      select: { id: true },
    })
    expect(tx.beneficiaryProjectEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: id,
        beneficiaryId: other,
        projectId: id,
        beneficiary: { organizationId: id, archivedAt: null },
        project: { organizationId: id, archivedAt: null, id: { in: [id] } },
      },
      select: { id: true },
    })
  })
  it('binds M&E beneficiary edit verification to its selected authorized project', async () => {
    await service.check(fixture('MONITORING_AND_EVALUATION_OFFICER'), {
      route: 'beneficiaryEdit',
      beneficiaryId: other,
      projectId: id,
    })
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ organizationId: id, archivedAt: null, id: { in: [id] } }, { id }] },
      select: { id: true },
    })
    expect(tx.beneficiaryProjectEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: id,
        beneficiaryId: other,
        projectId: id,
        beneficiary: { organizationId: id, archivedAt: null },
        project: { organizationId: id, archivedAt: null, id: { in: [id] } },
      },
      select: { id: true },
    })
  })
  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
    'denies identity data despite injected grants: %s',
    async (role) => {
      const identity = {
        ...fixture(role),
        permissions: [...rolePermissions.SYSTEM_ADMINISTRATOR],
      }
      await expect(
        service.check(identity, { route: 'beneficiary', beneficiaryId: id }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        service.check(identity, { route: 'reportPreview', kind: 'beneficiary-summary' }),
      ).rejects.toMatchObject({ status: 403 })
      expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    },
  )
  it('sanitizes database failure and never returns records, selectors or provider details', async () => {
    tx.project.findFirst.mockRejectedValue(new Error('private-provider-detail'))
    await expect(
      service.check(fixture('PROJECT_MANAGER'), { route: 'project', projectId: id }),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Route verification is temporarily unavailable.',
    })
  })
})
