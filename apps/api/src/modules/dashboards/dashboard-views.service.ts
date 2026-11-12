import { Inject, Injectable, Logger } from '@nestjs/common'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'

export type DashboardKey = 'home'

@Injectable()
export class DashboardViewsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Best effort: an unrecorded dashboard view is logged, never a failed dashboard.
  async record(identity: ApplicationIdentity, dashboard: DashboardKey): Promise<void> {
    try {
      await withAuthorizedOperation(this.prisma, identity, 'projects.read', async (tx, actor) => {
        const [row] = await tx.$queryRaw<Array<{ due: boolean }>>`
          SELECT pathways.p90_dashboard_view_due(pathways.runtime_context_user(), pathways.runtime_context_organization(), ${dashboard}::text) AS due`
        if (row?.due === true) {
          await writeAuditLog(tx, actor, {
            action: 'DASHBOARD_VIEWED',
            entityType: 'Dashboard',
            entityId: dashboard,
          })
        }
      })
    } catch {
      new Logger('DashboardAudit').warn({ event: 'PATHWAYS_DASHBOARD_AUDIT_UNAVAILABLE' })
    }
  }
}
