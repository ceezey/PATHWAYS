import { randomUUID } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import type { Tx } from '../../common/prisma/transaction'

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const retries = 3

// A PATHWAYS participant code: PW plus 10 Crockford base32 characters, unused in the organization.
export async function generateBeneficiaryCode(tx: Tx, organizationId: string) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const bytes = Buffer.from(randomUUID().replaceAll('-', ''), 'hex').subarray(0, 10)
    const code = `PW${Array.from(bytes, (byte) => crockford[byte % 32]).join('')}`
    const existing = await tx.beneficiary.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new ConflictException('A participant code could not be generated.')
}
