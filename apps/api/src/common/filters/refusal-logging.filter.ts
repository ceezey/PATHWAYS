import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'

import { PrismaService } from '../../prisma/prisma.service'
import { writeAuditLog } from '../audit/write-audit-log'
import type { AuthenticatedRequest } from '../authz/application-identity'
import { RateLimitService } from '../rate-limit/rate-limit.service'

type RefusedRequest = AuthenticatedRequest & { method?: unknown; route?: { path?: unknown } }

const METHOD_PATTERN = /^[A-Z]{1,16}$/
const CODE_PATTERN = /^[A-Z0-9_]{1,64}$/
const MAX_ROUTE_LENGTH = 300

// The matched route template, never the concrete URL, so no id or query reaches the record.
function routeTemplate(request: RefusedRequest) {
  const method =
    typeof request.method === 'string' && METHOD_PATTERN.test(request.method)
      ? request.method
      : 'UNKNOWN'
  const path = request.route?.path
  return {
    method,
    route: `${method} ${typeof path === 'string' ? path.slice(0, MAX_ROUTE_LENGTH) : 'unmatched'}`,
  }
}

// The machine code of a denial, when it carries one; nothing else of the response is kept.
function denialCode(exception: HttpException): string | undefined {
  const body = exception.getResponse()
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : null
  return typeof code === 'string' && CODE_PATTERN.test(code) ? code : undefined
}

/** Records refused access (401 in the log, 403 of a resolved user in the audit log) and leaves the response to Nest. */
@Catch(HttpException)
export class RefusalLoggingFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Refusal')

  constructor(
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super()
  }

  async catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus()
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      await this.record(exception, status, host.switchToHttp().getRequest<RefusedRequest>())
    }
    super.catch(exception, host)
  }

  private async record(exception: HttpException, status: number, request: RefusedRequest) {
    try {
      const { method, route } = routeTemplate(request)
      // The guard clears request.user on its own 403s, so it keeps the resolved one for this.
      const user = request.user ?? request.refusedUser
      if (!user || status !== HttpStatus.FORBIDDEN) {
        this.logger.warn({ event: 'PATHWAYS_AUTH_REFUSED', status, route })
        return
      }
      // At most one row per person and route per minute; the counter fails open and the write then reports itself.
      if ((await this.limits.hit(`authz-refused:${user.userId}:${route}`, 1)) > 0) return
      const code = denialCode(exception)
      await this.prisma.withVerifiedContext(
        { authSubject: user.id, organizationId: user.organizationId, userId: user.userId },
        (tx) =>
          writeAuditLog(tx, user, {
            action: 'AUTHZ_REFUSED',
            entityType: 'Route',
            entityId: route,
            changes: { method, status, ...(code ? { code } : {}) },
          }),
      )
    } catch {
      // A refusal is never changed by its own record; errors can carry ids, so none is logged.
      try {
        this.logger.warn({ event: 'PATHWAYS_AUTHZ_REFUSED_AUDIT_FAILED' })
      } catch {
        // Diagnostics must not change the response.
      }
    }
  }
}
