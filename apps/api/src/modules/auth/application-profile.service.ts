import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { readApplicationProfile } from '../../common/authz/application-profile'
import {
  InactiveVerifiedSessionError,
  PrismaService,
  type VerifiedTransactionTiming,
} from '../../prisma/prisma.service'
import { prismaDiagnosticCode, transactionDiagnostic } from '../../prisma/transaction-diagnostic'

import type { InspectionRequestBudget } from '../../common/network/inspection-request-budget'

@Injectable()
export class ApplicationProfileService {
  private readonly logger = new Logger(ApplicationProfileService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(
    authSubject: string,
    organizationSelector: unknown,
    userSelector: unknown,
  ): Promise<ApplicationIdentity> {
    return this.resolveContext(authSubject, organizationSelector, userSelector)
  }

  async resolveWithSession(
    authSubject: string,
    sessionId: unknown,
    organizationSelector: unknown,
    userSelector: unknown,
    onTiming?: (timing: VerifiedTransactionTiming) => void,
    budget?: InspectionRequestBudget,
  ): Promise<ApplicationIdentity> {
    if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
      throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
    }
    return this.resolveContext(
      authSubject,
      organizationSelector,
      userSelector,
      sessionId,
      onTiming,
      budget,
    )
  }

  private async resolveContext(
    authSubject: string,
    organizationSelector: unknown,
    userSelector: unknown,
    sessionId?: string,
    onTiming?: (timing: VerifiedTransactionTiming) => void,
    budget?: InspectionRequestBudget,
  ): Promise<ApplicationIdentity> {
    if (
      typeof authSubject !== 'string' ||
      !UUID_PATTERN.test(authSubject) ||
      typeof organizationSelector !== 'string' ||
      typeof userSelector !== 'string' ||
      !UUID_PATTERN.test(organizationSelector) ||
      !UUID_PATTERN.test(userSelector)
    ) {
      throw new ForbiddenException('A provisioned application context is required.')
    }
    const organizationId = organizationSelector.toLowerCase()
    const userId = userSelector.toLowerCase()
    try {
      // Headers are untrusted selectors ONLY. Immutable 0005 RLS checks all three
      // identifiers against the active database linkage before allowing any read.
      const databaseContext = sessionId
        ? { authSubject, organizationId, userId, sessionId }
        : { authSubject, organizationId, userId }
      const readProfile = (transaction: Prisma.TransactionClient) =>
        readApplicationProfile(transaction, authSubject, organizationId, userId)
      budget?.check()
      const result = await (onTiming || budget
        ? this.prisma.withVerifiedContext(databaseContext, readProfile, {
            onTiming,
            requestBudget: budget,
          })
        : this.prisma.withVerifiedContext(databaseContext, readProfile))
      budget?.check()
      return result
    } catch (error) {
      if (error instanceof InactiveVerifiedSessionError) {
        throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
      }
      // Fixed diagnostics only: never serialize provider errors, SQL, headers,
      // selectors, JWTs or connection settings into logs or public responses.
      const code = prismaDiagnosticCode(error)
      try {
        this.logger.warn({
          event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
          reason: code || 'CONTEXT_OR_PROFILE_UNAVAILABLE',
          ...transactionDiagnostic(error),
        })
      } catch {
        // Diagnostics must not expose provider errors or change the denial.
      }
      if (
        error instanceof ForbiddenException ||
        (error instanceof Error &&
          error.message === 'Database context is not linked to an active application identity.')
      ) {
        throw new ForbiddenException(
          'Application access is unavailable for this identity and context.',
        )
      }
      // A database/configuration outage must never masquerade as zero membership.
      throw new ServiceUnavailableException(
        'Application access verification is temporarily unavailable. Retry shortly.',
      )
    }
  }
}
