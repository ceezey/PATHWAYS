import 'reflect-metadata'

import { ForbiddenException, HttpException, Logger, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../authz/application-identity'
import type { RateLimitService } from '../rate-limit/rate-limit.service'
import { RefusalLoggingFilter } from './refusal-logging.filter'

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
} as ApplicationIdentity

const auditCreate = vi.fn()
const hit = vi.fn()
const withVerifiedContext = vi.fn(
  async (_context: unknown, work: (tx: unknown) => Promise<unknown>) =>
    work({ auditLog: { create: auditCreate } }),
)
const warn = vi.spyOn(Logger.prototype, 'warn')

const filter = new RefusalLoggingFilter(
  { hit } as unknown as RateLimitService,
  { withVerifiedContext } as unknown as PrismaService,
)
const reply = vi.spyOn(Object.getPrototypeOf(RefusalLoggingFilter.prototype), 'catch')

const catchWith = (exception: HttpException, request: object) =>
  filter.catch(exception, {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never)

const request = (extra: object = {}) => ({
  method: 'GET',
  url: '/api/beneficiaries/9f1c?q=secret',
  route: { path: '/api/beneficiaries/:id' },
  user,
  ...extra,
})

describe('RefusalLoggingFilter', () => {
  beforeEach(() => {
    hit.mockReset().mockResolvedValue(0)
    auditCreate.mockReset()
    withVerifiedContext.mockClear()
    warn.mockReset().mockImplementation(() => undefined)
    reply.mockReset().mockImplementation(() => undefined)
  })
  afterEach(() => vi.clearAllMocks())

  it('writes one capped row with the route template and no ids for a signed-in 403', async () => {
    const exception = new ForbiddenException({ code: 'STEP_UP_TOTP_REQUIRED', message: 'secret' })
    await catchWith(exception, request())

    expect(hit).toHaveBeenCalledWith(`authz-refused:${user.userId}:GET /api/beneficiaries/:id`, 1)
    expect(withVerifiedContext.mock.calls[0]?.[0]).toEqual({
      authSubject: user.id,
      organizationId: user.organizationId,
      userId: user.userId,
    })
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: 'AUTHZ_REFUSED',
        entityType: 'Route',
        entityId: 'GET /api/beneficiaries/:id',
        changes: { method: 'GET', status: 403, code: 'STEP_UP_TOTP_REQUIRED' },
      },
    })
    expect(JSON.stringify(auditCreate.mock.calls)).not.toMatch(/9f1c|secret/)
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('omits the code when the denial has none', async () => {
    await catchWith(
      new ForbiddenException('Required application permission is missing.'),
      request(),
    )
    expect(auditCreate.mock.calls[0]?.[0].data.changes).toEqual({ method: 'GET', status: 403 })
  })

  it('uses the user the guard kept when it cleared request.user', async () => {
    await catchWith(
      new ForbiddenException(),
      request({ user: undefined, refusedUser: user, method: 'POST' }),
    )
    expect(auditCreate.mock.calls[0]?.[0].data.entityId).toBe('POST /api/beneficiaries/:id')
  })

  it('writes nothing for a capped repeat and still replies', async () => {
    hit.mockResolvedValue(30)
    await catchWith(new ForbiddenException(), request())
    expect(withVerifiedContext).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('never alters the response when the write throws and logs one fixed warning', async () => {
    withVerifiedContext.mockRejectedValueOnce(new Error('beneficiary 9f1c secret'))
    const exception = new ForbiddenException()
    await expect(catchWith(exception, request())).resolves.toBeUndefined()
    expect(warn.mock.calls).toEqual([[{ event: 'PATHWAYS_AUTHZ_REFUSED_AUDIT_FAILED' }]])
    expect(reply).toHaveBeenCalledWith(exception, expect.anything())
  })

  it('never alters the response when the cap check throws', async () => {
    hit.mockRejectedValueOnce(new Error('down'))
    await catchWith(new ForbiddenException(), request())
    expect(warn.mock.calls).toEqual([[{ event: 'PATHWAYS_AUTHZ_REFUSED_AUDIT_FAILED' }]])
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('logs an anonymous 401 with the status and route template only', async () => {
    await catchWith(
      new UnauthorizedException('A bearer token is required.'),
      request({ user: undefined }),
    )
    expect(warn.mock.calls).toEqual([
      [{ event: 'PATHWAYS_AUTH_REFUSED', status: 401, route: 'GET /api/beneficiaries/:id' }],
    ])
    expect(hit).not.toHaveBeenCalled()
    expect(withVerifiedContext).not.toHaveBeenCalled()
  })

  it('logs a 403 with no resolved user in the server log, not the audit log', async () => {
    await catchWith(new ForbiddenException(), request({ user: undefined }))
    expect(warn.mock.calls).toEqual([
      [{ event: 'PATHWAYS_AUTH_REFUSED', status: 403, route: 'GET /api/beneficiaries/:id' }],
    ])
    expect(withVerifiedContext).not.toHaveBeenCalled()
  })

  it('ignores other statuses', async () => {
    await catchWith(new HttpException('gone', 404), request())
    expect(hit).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledTimes(1)
  })
})
