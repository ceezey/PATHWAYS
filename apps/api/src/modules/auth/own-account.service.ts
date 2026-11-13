import { Inject, Injectable } from '@nestjs/common'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { evaluateBeneficiaryStepUp } from './beneficiary-step-up'
import { type StepUpPinActor, totpRequired } from './beneficiary-step-up-pin.service'
import { PasswordRecoveryService } from './password-recovery.service'

@Injectable()
export class OwnAccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordRecoveryService) private readonly recovery: PasswordRecoveryService,
  ) {}

  // Records the sign-out of the verified session; the browser then ends the Supabase session.
  async recordSignOut(identity: ApplicationIdentity): Promise<void> {
    await withAuthorizedOperation(this.prisma, identity, 'profile.manage', (tx, actor) =>
      writeAuditLog(tx, actor, {
        action: 'SIGNED_OUT',
        entityType: 'Authentication',
        entityId: actor.userId,
      }),
    )
  }

  // Needs a fresh authenticator step; the audit row is written first so a refused Auth call rolls it back.
  async changePassword(actor: StepUpPinActor, password: string): Promise<void> {
    if (!evaluateBeneficiaryStepUp(actor.auth.mfaVerifiedAt).fresh) throw totpRequired()
    await withAuthorizedOperation(
      this.prisma,
      actor.profile,
      'profile.manage',
      async (tx, profile) => {
        await writeAuditLog(tx, profile, {
          action: 'OWN_PASSWORD_CHANGED',
          entityType: 'Authentication',
          entityId: profile.userId,
        })
        await this.recovery.setPassword(profile.id, password)
      },
      { transactionTimeoutMs: 15_000 },
    )
  }
}
