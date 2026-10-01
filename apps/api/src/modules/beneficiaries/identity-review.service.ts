import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import type { ResolveDuplicateDto } from './beneficiaries.dto'

type Tx = Prisma.TransactionClient

const RESOLVED_ACTIONS = ['BENEFICIARY_IDENTITY_KEPT_DISTINCT', 'BENEFICIARY_IDENTITY_LINKED']
const MAX_PROFILES = 500

const norm = (value: string | null) => (value ?? '').trim().toLocaleLowerCase()
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`)

@Injectable()
export class IdentityReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Pairs of enrolled profiles with the same name and birth date that no reviewer has resolved.
  candidates(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.identities.review',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const rows = await tx.beneficiary.findMany({
          where: {
            organizationId: actor.organizationId,
            archivedAt: null,
            birthDate: { not: null },
            beneficiaryProjectEnrollment_beneficiary: {
              some: { organizationId: actor.organizationId, projectId: id },
            },
          },
          select: {
            id: true,
            code: true,
            displayName: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            locationBarangay: true,
            locationCityMunicipality: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
          take: MAX_PROFILES,
        })
        const resolved = await this.resolvedPairs(tx, actor.organizationId, id)
        const groups = new Map<string, typeof rows>()
        for (const row of rows) {
          const name = row.firstName
            ? `${norm(row.firstName)} ${norm(row.lastName)}`
            : norm(row.displayName)
          if (!name.trim() || !row.birthDate) continue
          const key = `${name}|${row.birthDate.toISOString().slice(0, 10)}`
          groups.set(key, [...(groups.get(key) ?? []), row])
        }
        const summary = (row: (typeof rows)[number]) => ({
          id: row.id,
          code: row.code,
          name: row.displayName ?? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
          birthDate: row.birthDate?.toISOString().slice(0, 10) ?? '',
          location: [row.locationBarangay, row.locationCityMunicipality].filter(Boolean).join(', '),
          updatedAt: row.updatedAt.toISOString(),
        })
        const pairs = []
        for (const group of groups.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              if (resolved.has(pairKey(group[i].id, group[j].id))) continue
              pairs.push({ left: summary(group[i]), right: summary(group[j]) })
            }
          }
        }
        return pairs
      },
    )
  }

  // Both outcomes only record an audited reviewer decision; no profile data is moved or deleted.
  resolve(identity: ApplicationIdentity, projectId: string, input: ResolveDuplicateDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.identities.review',
      async (tx, actor) => {
        const id = await this.requireProject(tx, actor, projectId)
        const [leftId, rightId] = [input.leftId.toLowerCase(), input.rightId.toLowerCase()]
        if (leftId === rightId) throw new BadRequestException('Choose two different profiles.')
        const enrolled = await tx.beneficiary.count({
          where: {
            id: { in: [leftId, rightId] },
            organizationId: actor.organizationId,
            archivedAt: null,
            beneficiaryProjectEnrollment_beneficiary: {
              some: { organizationId: actor.organizationId, projectId: id },
            },
          },
        })
        if (enrolled !== 2) throw new NotFoundException('Beneficiary unavailable.')
        if (
          (await this.resolvedPairs(tx, actor.organizationId, id)).has(pairKey(leftId, rightId))
        ) {
          throw new BadRequestException('This pair was already reviewed.')
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: id,
            action:
              input.decision === 'LINK'
                ? 'BENEFICIARY_IDENTITY_LINKED'
                : 'BENEFICIARY_IDENTITY_KEPT_DISTINCT',
            entityType: 'Beneficiary',
            entityId: leftId,
            changes: { otherBeneficiaryId: rightId, decision: input.decision },
          },
        })
        return { leftId, rightId, decision: input.decision }
      },
    )
  }

  private async resolvedPairs(tx: Tx, organizationId: string, projectId: string) {
    const events = await tx.auditLog.findMany({
      where: { organizationId, projectId, action: { in: RESOLVED_ACTIONS } },
      select: { entityId: true, changes: true },
      take: 5000,
    })
    return new Set(
      events.flatMap((event) => {
        const other = (event.changes as { otherBeneficiaryId?: string } | null)?.otherBeneficiaryId
        return event.entityId && other ? [pairKey(event.entityId, other)] : []
      }),
    )
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }
}
