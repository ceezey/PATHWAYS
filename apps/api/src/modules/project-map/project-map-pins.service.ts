import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import type { MapPinPlaceQuery, SaveMapPinRequest } from '@pathways/shared'

import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProjectRow } from '../../common/authz/scoped-project'
import { resolvePlaces } from '../../common/places/ph-places'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'

const LOCKED = 'This pin is locked.'
const CHANGED = 'This pin changed. Try again.'

/** Saves, locks and resets the map positions of a project's places; the DB checks bounds and scope too. */
@Injectable()
export class ProjectMapPinsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Resolves the stored key of a place the project lists, or answers 400.
  private async placeKey(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    place: MapPinPlaceQuery,
  ) {
    const project = await requireScopedProjectRow(tx, actor, projectId, {
      id: true,
      implementationArea: true,
    })
    const listed = resolvePlaces(project.implementationArea).some(
      (candidate) => candidate.name === place.name && candidate.province === place.province,
    )
    if (!listed) {
      throw new BadRequestException("This place is not in the project's implementation area.")
    }
    return {
      organizationId: actor.organizationId,
      projectId: project.id,
      placeName: place.name,
      province: place.province,
    }
  }

  save(identity: ApplicationIdentity, projectId: string, input: SaveMapPinRequest) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.update', async (tx, actor) => {
      const key = await this.placeKey(tx, actor, projectId, input)
      const existing = await tx.projectMapPin.findUnique({
        where: { organizationId_projectId_placeName_province: key },
        select: { longitude: true, latitude: true, locked: true },
      })
      const fields = { longitude: input.longitude, latitude: input.latitude, locked: input.locked }
      if (!existing) {
        await tx.projectMapPin.create({ data: { ...key, ...fields, updatedById: actor.userId } })
      } else {
        const moved = existing.longitude !== input.longitude || existing.latitude !== input.latitude
        if (existing.locked && moved) throw new ConflictException(LOCKED)
        // A lock change never moves a pin, so a stale client cannot undo a move or clear a lock.
        if (input.locked !== existing.locked && moved) throw new ConflictException(CHANGED)
        // Matching the lock state read above makes a concurrent lock fail the write instead of losing it.
        const changed = await tx.projectMapPin.updateMany({
          where: { ...key, locked: existing.locked },
          data: { ...fields, updatedById: actor.userId, updatedAt: new Date() },
        })
        if (changed.count !== 1) throw new ConflictException(LOCKED)
      }
      await writeAuditLog(tx, actor, {
        projectId: key.projectId,
        action: 'PROJECT_MAP_PIN_SAVED',
        entityType: 'ProjectMapPin',
        entityId: key.projectId,
        changes: { name: input.name, province: input.province, ...fields },
      })
    })
  }

  reset(identity: ApplicationIdentity, projectId: string, place: MapPinPlaceQuery) {
    return withAuthorizedOperation(this.prisma, identity, 'projects.update', async (tx, actor) => {
      const key = await this.placeKey(tx, actor, projectId, place)
      const existing = await tx.projectMapPin.findUnique({
        where: { organizationId_projectId_placeName_province: key },
        select: { longitude: true, latitude: true, locked: true },
      })
      // A place with no saved row is already at its default position.
      if (!existing) return
      if (existing.locked) throw new ConflictException(LOCKED)
      const deleted = await tx.projectMapPin.deleteMany({ where: { ...key, locked: false } })
      if (deleted.count !== 1) throw new ConflictException(LOCKED)
      await writeAuditLog(tx, actor, {
        projectId: key.projectId,
        action: 'PROJECT_MAP_PIN_RESET',
        entityType: 'ProjectMapPin',
        entityId: key.projectId,
        changes: {
          name: place.name,
          province: place.province,
          longitude: existing.longitude,
          latitude: existing.latitude,
          locked: existing.locked,
        },
      })
    })
  }
}
