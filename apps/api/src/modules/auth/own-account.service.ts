import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import { endOwnSessions } from '../../common/authz/app-sessions'
import { UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { evaluateBeneficiaryStepUp } from './beneficiary-step-up'
import { type StepUpPinActor, totpRequired } from './beneficiary-step-up-pin.service'
import { PasswordRecoveryService } from './password-recovery.service'

@Injectable()
export class OwnAccountService {
  private readonly logger = new Logger(OwnAccountService.name)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordRecoveryService) private readonly recovery: PasswordRecoveryService,
  ) {}

  // Records the sign-out and ends the verified session; the browser then ends the Supabase session.
  async recordSignOut(actor: StepUpPinActor): Promise<void> {
    await withAuthorizedOperation(
      this.prisma,
      actor.profile,
      'profile.manage',
      async (tx, profile) => {
        await endOwnSessions(tx, actor.auth.id, { sessionId: actor.sessionId }, 'SIGNED_OUT')
        await writeAuditLog(tx, profile, {
          action: 'SIGNED_OUT',
          entityType: 'Authentication',
          entityId: profile.userId,
        })
      },
    )
  }

  // Ends one of the caller's own sessions, for example on a lost phone; needs a fresh authenticator step.
  async endSession(actor: StepUpPinActor, sessionId: string): Promise<void> {
    if (!evaluateBeneficiaryStepUp(actor.auth.mfaVerifiedAt).fresh) throw totpRequired()
    if (!UUID_PATTERN.test(sessionId)) throw new NotFoundException('Session unavailable.')
    await withAuthorizedOperation(
      this.prisma,
      actor.profile,
      'profile.manage',
      async (tx, profile) => {
        const ended = await endOwnSessions(
          tx,
          actor.auth.id,
          { sessionId: sessionId.toLowerCase() },
          'USER',
        )
        if (!ended) throw new NotFoundException('Session unavailable.')
        await writeAuditLog(tx, profile, {
          action: 'SESSION_ENDED',
          entityType: 'Authentication',
          entityId: profile.userId,
        })
      },
    )
  }

  // Ends every other session of the caller, then revokes them at Supabase; a refusal there rolls the whole step back.
  async endOtherSessions(
    actor: StepUpPinActor,
    accessToken: string,
  ): Promise<{ sessionsEnded: number }> {
    if (!evaluateBeneficiaryStepUp(actor.auth.mfaVerifiedAt).fresh) throw totpRequired()
    return withAuthorizedOperation(
      this.prisma,
      actor.profile,
      'profile.manage',
      async (tx, profile) => {
        const sessionsEnded = await endOwnSessions(
          tx,
          actor.auth.id,
          { keepId: actor.sessionId },
          'USER',
        )
        await writeAuditLog(tx, profile, {
          action: 'OTHER_SESSIONS_ENDED',
          entityType: 'Authentication',
          entityId: profile.userId,
          changes: { sessionsEnded },
        })
        await this.recovery.revokeOtherSessions(accessToken)
        return { sessionsEnded }
      },
      { transactionTimeoutMs: 15_000 },
    )
  }

  // Needs a fresh authenticator step; other sessions end and the audit row is written before the Auth call, so a refusal rolls both back.
  async changePassword(
    actor: StepUpPinActor,
    password: string,
    accessToken: string,
  ): Promise<void> {
    if (!evaluateBeneficiaryStepUp(actor.auth.mfaVerifiedAt).fresh) throw totpRequired()
    await withAuthorizedOperation(
      this.prisma,
      actor.profile,
      'profile.manage',
      async (tx, profile) => {
        const sessionsEnded = await endOwnSessions(
          tx,
          actor.auth.id,
          { keepId: actor.sessionId },
          'PASSWORD_CHANGED',
        )
        await writeAuditLog(tx, profile, {
          action: 'OWN_PASSWORD_CHANGED',
          entityType: 'Authentication',
          entityId: profile.userId,
          changes: { sessionsEnded },
        })
        await this.recovery.setPassword(profile.id, password)
      },
      { transactionTimeoutMs: 15_000 },
    )
    // Best effort: the password is changed and the PATHWAYS sessions are already ended.
    await this.recovery
      .revokeOtherSessions(accessToken)
      .catch(() => this.logger.warn({ event: 'PATHWAYS_OWN_PASSWORD_REVOKE_FAILED' }))
  }
}
