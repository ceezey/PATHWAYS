import { NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import type { Tx } from '../prisma/transaction'
import { type ApplicationIdentity, UUID_PATTERN } from './application-identity'
import { projectScope } from './project-scope'

const PROJECT_UNAVAILABLE = 'Project unavailable.'

// Reads the selected fields of one project inside the actor's scope, or answers 404 without saying why.
export async function requireScopedProjectRow<const S extends Prisma.ProjectSelect>(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  select: S,
): Promise<Prisma.ProjectGetPayload<{ select: S }>> {
  if (!UUID_PATTERN.test(projectId)) throw new NotFoundException(PROJECT_UNAVAILABLE)
  const fields: Prisma.ProjectSelect = select
  const project: unknown = await tx.project.findFirst({
    where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
    select: fields,
  })
  if (!project) throw new NotFoundException(PROJECT_UNAVAILABLE)
  return project as Prisma.ProjectGetPayload<{ select: S }>
}

// Returns the stored id of one project inside the actor's scope, or answers 404 without saying why.
export async function requireScopedProject(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
): Promise<string> {
  return (await requireScopedProjectRow(tx, actor, projectId, { id: true })).id
}

// Project fields that dated writes validate their dates against.
export const projectDateFields = { id: true, startDate: true, endDate: true } as const
