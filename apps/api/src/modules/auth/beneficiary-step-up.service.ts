import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'

import { InactiveVerifiedSessionError, PrismaService } from '../../prisma/prisma.service'
import { projectScope } from './authorized-data.service'
import {
  STEP_UP_REQUIRED_CODE,
  STEP_UP_WINDOW_SECONDS,
  type StepUpMethod,
  evaluateBeneficiaryStepUp,
} from './beneficiary-step-up'
import { readStepUpPinStatus } from './beneficiary-step-up-pin.service'
import {
  type ApplicationIdentity,
  UUID_PATTERN,
  type VerifiedAuthIdentity,
} from './developer-access'

// Best-effort per-instance dedupe so one verified factor or denial reason is
// audited once rather than on every request. Duplicates across instances are
// harmless; a missed audit is not, so entries are remembered only after commit.
const MAX_RECORDED = 2_048

@Injectable()
export class BeneficiaryStepUpService {
  private readonly recorded = new Set<string>()

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enforce(
    identity: VerifiedAuthIdentity,
    profile: ApplicationIdentity,
    operation: string,
    projectId: unknown,
    sessionId: string,
  ): Promise<void> {
    // Contract order (CR section 3, SDD section 6): project assignment before step-up.
    // Same scope predicate and uniform denial as the Beneficiary services.
    if (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId)) {
      throw new NotFoundException('Project unavailable.')
    }
    const state = evaluateBeneficiaryStepUp(identity.mfaVerifiedAt)
    // A fresh TOTP needs no grant lookup. Otherwise the PIN grant (cr-pathways-beneficiary-
    // step-up-pin) is read for this user, organization and verified session only, in the
    // same transaction as a session liveness recheck, and only once scope has passed.
    const pinFallback = !state.fresh && UUID_PATTERN.test(sessionId)
    let inScope: boolean
    let grantExpiresAt: Date | null = null
    try {
      const result = await this.prisma.withVerifiedContext(
        {
          authSubject: identity.id,
          organizationId: profile.organizationId,
          userId: profile.userId,
          ...(pinFallback ? { sessionId } : {}),
        },
        async (tx) => {
          const found =
            (await tx.project.findFirst({
              where: { AND: [projectScope(profile), { id: projectId.toLowerCase() }] },
              select: { id: true },
            })) !== null
          if (!found || !pinFallback) return { found, grantExpiresAt: null }
          return {
            found,
            grantExpiresAt: (await readStepUpPinStatus(tx, sessionId)).grantExpiresAt,
          }
        },
      )
      inScope = result.found
      grantExpiresAt = result.grantExpiresAt
    } catch (error) {
      if (error instanceof InactiveVerifiedSessionError) {
        throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
      }
      throw new ServiceUnavailableException('Project scope could not be verified.')
    }
    if (!inScope) throw new NotFoundException('Project unavailable.')

    const method: StepUpMethod | null = state.fresh ? 'TOTP' : grantExpiresAt ? 'PIN' : null
    const factorVerifiedAt =
      identity.mfaVerifiedAt === undefined || !Number.isFinite(identity.mfaVerifiedAt)
        ? null
        : new Date(identity.mfaVerifiedAt * 1000).toISOString()
    const grantExpiry = method === 'PIN' && grantExpiresAt ? grantExpiresAt.toISOString() : null
    const action = method ? 'BENEFICIARY_STEP_UP_ACCEPTED' : 'BENEFICIARY_STEP_UP_REQUIRED'
    const key = [
      action,
      profile.organizationId,
      profile.userId,
      method ?? '',
      method === 'PIN' ? grantExpiry : (factorVerifiedAt ?? 'none'),
      state.fresh ? '' : state.reason,
    ].join(':')
    if (!this.recorded.has(key)) {
      try {
        await this.prisma.withVerifiedContext(
          {
            authSubject: identity.id,
            organizationId: profile.organizationId,
            userId: profile.userId,
          },
          (tx) =>
            tx.auditLog.create({
              data: {
                organizationId: profile.organizationId,
                actorUserId: profile.userId,
                action,
                entityType: 'BeneficiaryStepUp',
                changes: {
                  operation,
                  ...(method ? { method } : {}),
                  factorVerifiedAt,
                  ...(grantExpiry ? { grantExpiresAt: grantExpiry } : {}),
                  windowSeconds: STEP_UP_WINDOW_SECONDS,
                  ...(method || state.fresh ? {} : { reason: state.reason }),
                },
              },
            }),
        )
        if (this.recorded.size >= MAX_RECORDED) {
          const oldest = this.recorded.values().next().value
          if (oldest !== undefined) this.recorded.delete(oldest)
        }
        this.recorded.add(key)
      } catch {
        // Denial stays a denial. Acceptance without its audit record is withheld.
        if (method) {
          throw new ServiceUnavailableException('Beneficiary access could not be recorded.')
        }
      }
    }
    if (!method) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: STEP_UP_REQUIRED_CODE,
        message: 'Recent MFA verification is required for Beneficiary detail.',
      })
    }
  }
}
