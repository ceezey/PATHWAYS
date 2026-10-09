import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { Tx } from '../prisma/transaction'
import type { ApplicationIdentity } from './application-identity'
import { requireScopedProject, requireScopedProjectRow } from './scoped-project'

const org = '61000000-0000-4000-8000-000000000001'
const project = '61000000-0000-4000-8000-00000000000a'
const actor: ApplicationIdentity = {
  id: '61000000-0000-4000-8000-000000000002',
  aal: 'aal2',
  userId: '61000000-0000-4000-8000-000000000003',
  organizationId: org,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: [],
  assignedProjectIds: [project],
}
const scopedWhere = (id: string) => ({
  AND: [{ organizationId: org, archivedAt: null, id: { in: [project] } }, { id }],
})
const txReturning = (row: unknown) => {
  const findFirst = vi.fn().mockResolvedValue(row)
  return { tx: { project: { findFirst } } as unknown as Tx, findFirst }
}

describe('requireScopedProject', () => {
  it('returns the stored id of a project inside the actor scope', async () => {
    const { tx, findFirst } = txReturning({ id: project })
    await expect(requireScopedProject(tx, actor, project)).resolves.toBe(project)
    expect(findFirst).toHaveBeenCalledWith({ where: scopedWhere(project), select: { id: true } })
  })

  it('queries an uppercase id in lowercase', async () => {
    const { tx, findFirst } = txReturning({ id: project })
    await expect(requireScopedProject(tx, actor, project.toUpperCase())).resolves.toBe(project)
    expect(findFirst).toHaveBeenCalledWith({ where: scopedWhere(project), select: { id: true } })
  })

  it.each(['', 'not-a-uuid', 'constructor', `${project} `, `${project}0`])(
    'answers 404 for %j before any query',
    async (value) => {
      const { tx, findFirst } = txReturning({ id: project })
      const error = await requireScopedProject(tx, actor, value).catch((caught) => caught)
      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.message).toBe('Project unavailable.')
      expect(findFirst).not.toHaveBeenCalled()
    },
  )

  it('answers 404, never 403, for a project outside the actor scope', async () => {
    const { tx } = txReturning(null)
    const error = await requireScopedProject(tx, actor, project).catch((caught) => caught)
    expect(error).toBeInstanceOf(NotFoundException)
    expect(error.getStatus()).toBe(404)
    expect(error.message).toBe('Project unavailable.')
  })
})

describe('requireScopedProjectRow', () => {
  it('reads exactly the requested project fields', async () => {
    const row = { id: project, startDate: null, endDate: null }
    const { tx, findFirst } = txReturning(row)
    await expect(
      requireScopedProjectRow(tx, actor, project, { id: true, startDate: true, endDate: true }),
    ).resolves.toBe(row)
    expect(findFirst).toHaveBeenCalledWith({
      where: scopedWhere(project),
      select: { id: true, startDate: true, endDate: true },
    })
  })
})
