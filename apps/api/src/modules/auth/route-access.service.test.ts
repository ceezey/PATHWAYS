import { ForbiddenException, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type RouteKey,
  type RouteSelection,
  routePolicy,
} from '../../../../web/src/lib/rbac/route-access'
import type { PrismaService } from '../../prisma/prisma.service'
import { readApplicationProfile } from './application-profile.service'
import { type CanonicalRole, rolePermissions } from './authorization-policy'
import type { ApplicationIdentity } from './developer-access'
import { RouteAccessService } from './route-access.service'

vi.mock('./application-profile.service', () => ({ readApplicationProfile: vi.fn() }))
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
const common = 'dashboard unauthorized projects project analytics reports surveyReport'
// Independent, explicit expected route matrix; no expectations computed from the policy under test.
const allowed: Record<CanonicalRole, string> = {
  SYSTEM_ADMINISTRATOR: `${common} activities activity budget journey monitoring beneficiaries beneficiary collection forms formCreate imports alerts recommendations rules settingsRules projectReport indicatorReport beneficiaryReport reportPreview users labels settings`,
  PROGRAM_MANAGER: `${common} activities activity budget journey monitoring transparency transparencyPreview collection forms formCreate imports alerts recommendations rules settingsRules projectReport indicatorReport users`,
  GRANT_MANAGER: `${common} budget projectReport indicatorReport`,
  PROJECT_MANAGER: `${common} projectCreate activities activity budget journey monitoring transparency transparencyPreview beneficiaries beneficiary collection forms formCreate imports alerts recommendations rules settingsRules projectReport indicatorReport beneficiaryReport reportPreview users`,
  MONITORING_AND_EVALUATION_OFFICER: `${common} activities activity evidence indicators budget journey monitoring beneficiaries beneficiary collection forms formCreate imports rules settingsRules projectReport indicatorReport beneficiaryReport reportPreview`,
  PROJECT_OFFICER: `${common} activities activity budget beneficiaries beneficiary collection forms formCreate imports beneficiaryReport reportPreview`,
}
const select = (route: RouteKey): RouteSelection => ({
  route,
  ...Object.fromEntries([...routePolicy[route].path.matchAll(/:(\w+)/g)].map((m) => [m[1], id])),
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readApplicationProfile).mockResolvedValue(fixture('SYSTEM_ADMINISTRATOR'))
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
        vi.mocked(readApplicationProfile).mockResolvedValue(identity)
        const result = service.check(identity, select(route))
        if (allowed[role].split(' ').includes(route)) {
          expect(await result).toEqual({
            route,
            presentation: 'prototype-only',
            beneficiaryAccess: ['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(role)
              ? 'aggregate-only'
              : 'records-or-none',
          })
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
  const fail = () => service.check(fixture('SYSTEM_ADMINISTRATOR'), { route: 'dashboard' })

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
    vi.mocked(readApplicationProfile).mockRejectedValue(error)
    await expect(fail()).rejects.toMatchObject({
      status: 503,
      message: 'Route verification is temporarily unavailable.',
    })
    expect(output).toHaveBeenCalledExactlyOnceWith({
      event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
      stage: 'PROFILE_READ',
      reason: code,
      ...(code === 'P2028' ? { transactionFailure: 'UNCLASSIFIED' } : {}),
    })
    expect(JSON.stringify(output.mock.calls)).not.toContain(privateContent)
  })

  it.each(['start', 'completion'])(
    'distinguishes transaction %s from profile work',
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
      await expect(
        service.check(fixture('SYSTEM_ADMINISTRATOR'), select(route)),
      ).rejects.toMatchObject({ status: 503 })
      expect(output).toHaveBeenCalledExactlyOnceWith({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage,
        reason: 'P2010',
      })
    },
  )

  it.each(['production', 'test'])('emits nothing in %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    vi.mocked(readApplicationProfile).mockRejectedValue({ code: 'P2028' })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    expect(output).not.toHaveBeenCalled()
  })

  it('never evaluates a code getter or emits an arbitrary provider code', async () => {
    const getter = vi.fn(() => privateContent)
    const error = Object.defineProperty(new Error(privateContent), 'code', { get: getter })
    vi.mocked(readApplicationProfile)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce({ code: privateContent })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    await expect(fail()).rejects.toMatchObject({ status: 503 })
    expect(getter).not.toHaveBeenCalled()
    for (const [event] of output.mock.calls) {
      expect(event).toEqual({
        event: 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE',
        stage: 'PROFILE_READ',
        reason: 'CHECK_FAILED',
      })
    }
    expect(output).toHaveBeenCalledTimes(2)
  })

  it('does not label successful access or expected permission denial as an outage', async () => {
    await expect(fail()).resolves.toHaveProperty('route', 'dashboard')
    vi.mocked(readApplicationProfile).mockResolvedValue({
      ...fixture('SYSTEM_ADMINISTRATOR'),
      permissions: [],
    })
    await expect(fail()).rejects.toMatchObject({ status: 403 })
    expect(output).not.toHaveBeenCalled()
  })

  it('still denies when the diagnostic sink fails', async () => {
    output.mockImplementation(() => {
      throw new Error(privateContent)
    })
    vi.mocked(readApplicationProfile).mockRejectedValue({ code: 'P2028' })
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
      vi.mocked(readApplicationProfile).mockRejectedValue({
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
        stage: 'PROFILE_READ',
        reason: 'P2028',
        transactionFailure: kind,
      })
    },
  )
})
describe('fresh transaction and relational object scope', () => {
  it('rechecks membership and role between requests, ignoring old identity permissions', async () => {
    const identity = fixture('SYSTEM_ADMINISTRATOR')
    await service.check(identity, { route: 'beneficiaries' })
    vi.mocked(readApplicationProfile).mockResolvedValue(fixture('GRANT_MANAGER'))
    await expect(service.check(identity, { route: 'beneficiaries' })).rejects.toMatchObject({
      status: 403,
    })
    vi.mocked(readApplicationProfile).mockRejectedValue(new ForbiddenException())
    await expect(service.check(identity, { route: 'dashboard' })).rejects.toMatchObject({
      status: 403,
    })
    expect(readApplicationProfile).toHaveBeenCalledTimes(3)
  })
  it.each(['id', 'userId', 'organizationId'] as const)(
    'rejects cross-user/organization %s returned by the authority',
    async (field) => {
      vi.mocked(readApplicationProfile).mockResolvedValue({
        ...fixture('SYSTEM_ADMINISTRATOR'),
        [field]: other,
      })
      await expect(
        service.check(fixture('SYSTEM_ADMINISTRATOR'), { route: 'dashboard' }),
      ).rejects.toMatchObject({ status: 403 })
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
    vi.mocked(readApplicationProfile).mockResolvedValue({
      ...fixture('SYSTEM_ADMINISTRATOR'),
      permissions: [],
    })
    await expect(
      service.check(fixture('SYSTEM_ADMINISTRATOR'), { route: 'dashboard' }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it.each([
    'PROJECT_MANAGER',
    'MONITORING_AND_EVALUATION_OFFICER',
    'PROJECT_OFFICER',
    'GRANT_MANAGER',
  ] as const)('requires current project assignment: %s', async (role) => {
    const identity = fixture(role)
    vi.mocked(readApplicationProfile).mockResolvedValue(identity)
    await service.check(identity, { route: 'project', projectId: id })
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ organizationId: id, archivedAt: null, id: { in: [id] } }, { id }] },
      select: { id: true },
    })
    vi.mocked(readApplicationProfile).mockResolvedValue({ ...identity, assignedProjectIds: [] })
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.check(identity, { route: 'project', projectId: id }),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0].id.in).toEqual([])
  })
  it('keeps administrator organization scope and manager portfolio scope', async () => {
    await service.check(fixture('SYSTEM_ADMINISTRATOR'), { route: 'project', projectId: other })
    expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0]).toEqual({
      organizationId: id,
      archivedAt: null,
    })
    vi.mocked(readApplicationProfile).mockResolvedValue(fixture('PROGRAM_MANAGER'))
    await service.check(fixture('PROGRAM_MANAGER'), { route: 'project', projectId: other })
    expect(tx.project.findFirst.mock.lastCall?.[0].where.AND[0].OR[1]).toEqual({
      program: { organizationId: id, managerUserId: id, archivedAt: null },
    })
  })
  it('rejects changed activity parent and non-enrolled Beneficiary', async () => {
    tx.projectActivity.findFirst.mockResolvedValue(null)
    await expect(
      service.check(fixture('SYSTEM_ADMINISTRATOR'), {
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
      service.check(fixture('SYSTEM_ADMINISTRATOR'), {
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
  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
    'denies identity data despite injected grants: %s',
    async (role) => {
      vi.mocked(readApplicationProfile).mockResolvedValue({
        ...fixture(role),
        permissions: [...rolePermissions.SYSTEM_ADMINISTRATOR],
      })
      await expect(
        service.check(fixture(role), { route: 'beneficiary', beneficiaryId: id }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        service.check(fixture(role), { route: 'reportPreview', kind: 'beneficiary-summary' }),
      ).rejects.toMatchObject({ status: 403 })
      expect(tx.beneficiaryProjectEnrollment.findFirst).not.toHaveBeenCalled()
    },
  )
  it('sanitizes database failure and never returns records, selectors or provider details', async () => {
    vi.mocked(readApplicationProfile).mockRejectedValue(new Error('private-provider-detail'))
    await expect(
      service.check(fixture('SYSTEM_ADMINISTRATOR'), { route: 'dashboard' }),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Route verification is temporarily unavailable.',
    })
  })
})
