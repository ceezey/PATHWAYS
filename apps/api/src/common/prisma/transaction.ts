import type { Prisma } from '@prisma/client'

// The interactive transaction client that authorized operations pass to their helpers.
export type Tx = Prisma.TransactionClient
