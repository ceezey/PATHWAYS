import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import { ForbiddenException, HttpException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { vi } from 'vitest'

// Runs work on the fake transaction like the real wrapper, which answers any non-Http error with 403.
export function fakeAuthorizedOperation(tx: unknown) {
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) => {
    try {
      return await fn(tx as Prisma.TransactionClient, identity)
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new ForbiddenException('Required application permission is missing.')
    }
  }) as typeof withAuthorizedOperation)
}
