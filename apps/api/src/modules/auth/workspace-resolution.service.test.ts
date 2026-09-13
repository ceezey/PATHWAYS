import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationProfileService } from './application-profile.service'
import { AuthorizedDataService } from './authorized-data.service'
import { type ApplicationIdentity, DEVELOPER_AUTH_UUID } from './developer-access'
import { WorkspaceResolutionService } from './workspace-resolution.service'

const organizationId = '30000000-0000-4000-8000-000000000003'
const userId = '40000000-0000-4000-8000-000000000004'
const foreignId = '50000000-0000-4000-8000-000000000005'
const identity = { id: DEVELOPER_AUTH_UUID, aal: 'aal2' as const }
const profile: ApplicationIdentity = {
  ...identity,
  organizationId,
  userId,
  organizationName: 'Synthetic workspace',
  fullName: 'Fixture only',
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read', 'beneficiaries.records.read'],
  assignedProjectIds: [],
}
const profiles = { resolve: vi.fn() }
const prisma = { discoverWorkspace: vi.fn() }
const service = new WorkspaceResolutionService(
  prisma as unknown as PrismaService,
  profiles as unknown as ApplicationProfileService,
)

beforeEach(() => {
  prisma.discoverWorkspace.mockReset().mockResolvedValue([{ organizationId, userId }])
  profiles.resolve.mockReset().mockResolvedValue(profile)
})

describe('verified-subject workspace resolution (no live resources)', () => {
  it('returns only the database-validated workspace context and a safe label', async () => {
    await expect(service.discover(identity)).resolves.toEqual({
      authUserId: identity.id,
      workspaces: [{ organizationId, userId, displayName: 'Synthetic workspace' }],
    })
    expect(prisma.discoverWorkspace).toHaveBeenCalledExactlyOnceWith(identity.id)
    expect(profiles.resolve).toHaveBeenCalledExactlyOnceWith(identity.id, organizationId, userId)
  })
  it('returns zero workspaces only for an explicit empty database result', async () => {
    prisma.discoverWorkspace.mockResolvedValue([])
    expect((await service.discover(identity)).workspaces).toEqual([])
    expect(profiles.resolve).not.toHaveBeenCalled()
  })
  it('requires AAL2 even when called directly', async () => {
    await expect(service.discover({ ...identity, aal: 'aal1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
  it('fails closed rather than selecting one of multiple linked profiles', async () => {
    prisma.discoverWorkspace.mockResolvedValue([
      { organizationId, userId },
      { organizationId: foreignId, userId: foreignId },
    ])
    await expect(service.discover(identity)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
  it.each([undefined, '', 'fabricated', [organizationId], foreignId])(
    'rejects altered organization selection %#',
    async (selector) => {
      await expect(service.resolveSelection(identity, selector, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    },
  )
  it('rejects cross-user selections, including after successful discovery', async () => {
    await service.discover(identity)
    await expect(
      service.resolveSelection(identity, organizationId, foreignId),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('rechecks permissions, role and assignment changes between requests', async () => {
    await expect(service.resolveSelection(identity, organizationId, userId)).resolves.toEqual(
      profile,
    )
    profiles.resolve.mockResolvedValue({
      ...profile,
      roles: ['GRANT_MANAGER'],
      permissions: ['projects.read'],
      assignedProjectIds: [foreignId],
    })
    await expect(service.resolveSelection(identity, organizationId, userId)).resolves.toMatchObject(
      { roles: ['GRANT_MANAGER'], assignedProjectIds: [foreignId] },
    )
    profiles.resolve.mockResolvedValue({ ...profile, permissions: [] })
    await expect(service.resolveSelection(identity, organizationId, userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    profiles.resolve.mockRejectedValue(new ForbiddenException())
    await expect(service.discover(identity)).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('does not reuse a selected context after profile removal', async () => {
    await service.resolveSelection(identity, organizationId, userId)
    prisma.discoverWorkspace.mockResolvedValue([])
    await expect(service.resolveSelection(identity, organizationId, userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
  it.each([
    { id: foreignId },
    { organizationId: foreignId },
    { userId: foreignId },
    { aal: 'aal1' },
  ])('rejects an inconsistent authority response %#', async (override) => {
    profiles.resolve.mockResolvedValue({ ...profile, ...override })
    await expect(service.discover(identity)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
  it.each([
    new Error('private provider detail'),
    new ServiceUnavailableException('private provider detail'),
    { code: 'private' },
  ])('never treats unknown failures as zero membership %#', async (error) => {
    profiles.resolve.mockRejectedValue(error)
    await expect(service.discover(identity)).rejects.toThrow(
      'Workspace verification is temporarily unavailable.',
    )
  })
  it('sanitizes discovery failures', async () => {
    prisma.discoverWorkspace.mockRejectedValue(new Error('private database detail'))
    await expect(service.discover(identity)).rejects.toThrow(
      'Workspace verification is temporarily unavailable.',
    )
  })
})

describe('Stage 3 preserves transaction-level role/project scope', () => {
  function dataService(role: string) {
    const row = {
      id: userId,
      organizationId,
      organization: { name: 'Synthetic' },
      fullName: 'Synthetic',
      role: {
        code: role,
        rolePermissions: [
          'projects.read',
          'beneficiaries.records.read',
          'beneficiaries.aggregates.read',
        ].map((code) => ({ permission: { code } })),
      },
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([row]),
      userProjectAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      project: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      beneficiaryProjectEnrollment: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(3) },
    }
    const withVerifiedContext = vi.fn(
      async (_context: unknown, work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        work(tx as unknown as Prisma.TransactionClient),
    )
    return {
      tx,
      withVerifiedContext,
      service: new AuthorizedDataService({ withVerifiedContext } as unknown as PrismaService),
    }
  }
  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'])(
    'denies Beneficiary identity queries for aggregate-only %s despite stale admin input',
    async (role) => {
      const { service, tx } = dataService(role)
      await expect(
        service.beneficiaries({ ...profile, roles: ['SYSTEM_ADMINISTRATOR'] }, foreignId),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(tx.beneficiaryProjectEnrollment.findMany).not.toHaveBeenCalled()
      expect(tx.project.findFirst).not.toHaveBeenCalled()
    },
  )
  it.each([
    'PROJECT_OFFICER',
    'PROJECT_MANAGER',
    'MONITORING_AND_EVALUATION_OFFICER',
    'GRANT_MANAGER',
  ])('requires current same-organization project assignment for %s', async (role) => {
    const { service, tx } = dataService(role)
    await expect(
      service.beneficiaryAggregate({ ...profile, assignedProjectIds: [foreignId] }, foreignId),
    ).rejects.toThrow('Project unavailable.')
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ organizationId, archivedAt: null, id: { in: [] } }, { id: foreignId }] },
      select: { id: true },
    })
    expect(tx.beneficiaryProjectEnrollment.count).not.toHaveBeenCalled()
  })
  it('denies a role revoked inside the business transaction after guard success', async () => {
    const { service, tx } = dataService('SYSTEM_ADMINISTRATOR')
    tx.$queryRaw.mockResolvedValue([])
    await expect(service.projects(profile)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findMany).not.toHaveBeenCalled()
  })
})
