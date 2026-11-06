import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

/** The newest form of the project whose stage date lists the part's code; this lookup is the file layout. */
export function findStageForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  partCode: string,
  statuses: Array<'PUBLISHED' | 'DRAFT'> = ['PUBLISHED', 'DRAFT'],
) {
  return tx.digitalForm.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      status: { in: statuses },
      formField_form: { some: { code: 'stage_date', sourceNames: { has: partCode } } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, version: true, status: true, journeyStageId: true },
  })
}
