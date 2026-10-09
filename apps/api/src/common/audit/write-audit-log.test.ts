import { describe, expect, it, vi } from 'vitest'

import type { Tx } from '../prisma/transaction'
import { writeAuditLog } from './write-audit-log'

const actor = {
  organizationId: '62000000-0000-4000-8000-000000000001',
  userId: '62000000-0000-4000-8000-000000000002',
}
const txWithAudit = () => {
  const create = vi.fn().mockResolvedValue({ id: 'row' })
  return { tx: { auditLog: { create } } as unknown as Tx, create }
}

describe('writeAuditLog', () => {
  it('writes the actor organization and user with the entry in the given transaction', async () => {
    const { tx, create } = txWithAudit()
    await expect(
      writeAuditLog(tx, actor, {
        projectId: 'p',
        action: 'A',
        entityType: 'E',
        entityId: 'e',
        changes: { count: 1 },
      }),
    ).resolves.toEqual({ id: 'row' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId: 'p',
        action: 'A',
        entityType: 'E',
        entityId: 'e',
        changes: { count: 1 },
      },
    })
  })

  it('leaves omitted columns out so they stay null and keeps an empty changes object', async () => {
    const { tx, create } = txWithAudit()
    await writeAuditLog(tx, actor, { action: 'A', entityType: 'E' })
    expect(Object.keys(create.mock.calls[0][0].data).sort()).toEqual([
      'action',
      'actorUserId',
      'entityType',
      'organizationId',
    ])
    await writeAuditLog(tx, actor, { action: 'B', entityType: 'E', changes: {} })
    expect(create.mock.calls[1][0].data.changes).toEqual({})
  })

  it('copies no identity field other than the organization and user', async () => {
    const { tx, create } = txWithAudit()
    const identity = { ...actor, roles: ['SYSTEM_ADMINISTRATOR'], permissions: ['users.manage'] }
    await writeAuditLog(tx, identity, { action: 'A', entityType: 'E' })
    expect(create.mock.calls[0][0].data).not.toHaveProperty('roles')
    expect(create.mock.calls[0][0].data).not.toHaveProperty('permissions')
  })
})
