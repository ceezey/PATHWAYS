import { Inject, Injectable } from '@nestjs/common'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class OwnAccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
