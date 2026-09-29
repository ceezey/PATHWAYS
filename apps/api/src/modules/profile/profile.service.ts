import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { UpdateOwnProfileDto } from './profile.dto'

const selection = { fullName: true, contactNumber: true, updatedAt: true } as const
type OwnProfile = { fullName: string; contactNumber: string | null; updatedAt: Date }
const serialize = (row: OwnProfile) => ({
  fullName: row.fullName,
  contactNumber: row.contactNumber,
  updatedAt: row.updatedAt.toISOString(),
})

@Injectable()
export class ProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  read(identity: ApplicationIdentity) {
    return withAuthorizedOperation(this.prisma, identity, 'profile.manage', async (tx, actor) => {
      const row = await tx.systemUser.findFirst({
        where: {
          id: actor.userId,
          organizationId: actor.organizationId,
          authUserId: actor.id,
          accountStatus: 'ACTIVE',
          archivedAt: null,
        },
        select: selection,
      })
      if (!row) throw new NotFoundException('Profile unavailable.')
      return serialize(row)
    })
  }

  update(identity: ApplicationIdentity, input: UpdateOwnProfileDto) {
    return withAuthorizedOperation(this.prisma, identity, 'profile.manage', async (tx) => {
      // Actor and organization come exclusively from verified transaction context.
      const rows = await tx.$queryRaw<OwnProfile[]>`
        SELECT full_name AS "fullName", contact_number AS "contactNumber", updated_at AS "updatedAt"
        FROM pathways.p10_update_own_profile(${input.fullName}::text,
          ${input.contactNumber || null}::text, ${new Date(input.expectedUpdatedAt)}::timestamptz)`
      if (rows.length !== 1) throw new ConflictException('Profile changed; reload before saving.')
      return serialize(rows[0])
    })
  }
}
