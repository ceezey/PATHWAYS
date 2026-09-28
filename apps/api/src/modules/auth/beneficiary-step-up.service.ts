import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from './authorized-data.service'
import {
  STEP_UP_REQUIRED_CODE,
  STEP_UP_WINDOW_SECONDS,
  evaluateBeneficiaryStepUp,
} from './beneficiary-step-up'
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
  ): Promise<void> {
    // Contract order (CR section 3, SDD section 6): project assignment before step-up.
    // Same scope predicate and uniform denial as the Beneficiary services.
    if (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId)) {
      throw new NotFoundException('Project unavailable.')
    }
    let inScope: boolean
    try {
      inScope = await this.prisma.withVerifiedContext(
        {
          authSubject: identity.id,
          organizationId: profile.organizationId,
          userId: profile.userId,
        },
        async (tx) =>
          (await tx.project.findFirst({
            where: { AND: [projectScope(profile), { id: projectId.toLowerCase() }] },
            select: { id: true },
          })) !== null,
      )
    } catch {
      throw new ServiceUnavailableException('Project scope could not be verified.')
    }
    if (!inScope) throw new NotFoundException('Project unavailable.')

    const state = evaluateBeneficiaryStepUp(identity.mfaVerifiedAt)
    const factorVerifiedAt =
      identity.mfaVerifiedAt === undefined || !Number.isFinite(identity.mfaVerifiedAt)
        ? null
        : new Date(identity.mfaVerifiedAt * 1000).toISOString()
    const action = state.fresh ? 'BENEFICIARY_STEP_UP_ACCEPTED' : 'BENEFICIARY_STEP_UP_REQUIRED'
    const key = [
      action,
      profile.organizationId,
      profile.userId,
      factorVerifiedAt ?? 'none',
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
                  factorVerifiedAt,
                  windowSeconds: STEP_UP_WINDOW_SECONDS,
                  ...(state.fresh ? {} : { reason: state.reason }),
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
        if (state.fresh) {
          throw new ServiceUnavailableException('Beneficiary access could not be recorded.')
        }
      }
    }
    if (!state.fresh) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: STEP_UP_REQUIRED_CODE,
        message: 'Recent MFA verification is required for Beneficiary detail.',
      })
    }
  }
}
