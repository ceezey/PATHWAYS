import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardViewsService } from './dashboard-views.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const ORG = '10000000-0000-4000-8000-00000000000a'
const USER = '30000000-0000-4000-8000-000000000001'
const identity = {
  id: USER,
  aal: 'aal2',
  userId: USER,
  organizationId: ORG,
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read'],
} as unknown as ApplicationIdentity

const tx = { $queryRaw: vi.fn(), auditLog: { create: vi.fn() } }
let operationOptions: { isolationLevel?: unknown } | undefined
const service = new DashboardViewsService({} as PrismaService)

describe('DashboardViewsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    operationOptions = undefined
    tx.auditLog.create.mockResolvedValue({})
    vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, who, _perm, fn, options) => {
      operationOptions = options
      return fn(tx as unknown as Prisma.TransactionClient, who)
    }) as typeof withAuthorizedOperation)
  })

  it('records DASHBOARD_VIEWED when the 30-minute window is open', async () => {
    tx.$queryRaw.mockResolvedValue([{ due: true }])
    await service.record(identity, 'home')
    const sql = tx.$queryRaw.mock.calls[0][0].join('?')
    expect(sql).toContain(
      'pathways.p90_dashboard_view_due(pathways.runtime_context_user(), pathways.runtime_context_organization(),',
    )
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('home')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorUserId: USER,
        action: 'DASHBOARD_VIEWED',
        entityType: 'Dashboard',
        entityId: 'home',
      },
    })
    expect(operationOptions?.isolationLevel).toBeUndefined()
  })

  it('writes nothing inside the window', async () => {
    tx.$queryRaw.mockResolvedValue([{ due: false }])
    await service.record(identity, 'home')
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('logs and resolves when the throttle or audit write fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    tx.$queryRaw.mockRejectedValueOnce(new Error('throttle down'))
    await expect(service.record(identity, 'home')).resolves.toBeUndefined()
    tx.$queryRaw.mockResolvedValue([{ due: true }])
    tx.auditLog.create.mockRejectedValueOnce(new Error('insert refused'))
    await expect(service.record(identity, 'home')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith({ event: 'PATHWAYS_DASHBOARD_AUDIT_UNAVAILABLE' })
  })
})
