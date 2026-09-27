import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import {
  type SourceRequestKey,
  abandonRuleSourceOperation,
  operations,
  sourceMutationBody,
} from './rules-source-operation'

const requestSchema = z
  .object({
    operation: z.enum(operations),
    sourceId: z.string().uuid().nullable(),
    requestId: z.string().uuid(),
    body: z.record(z.string(), z.unknown()),
  })
  .strict()
const permissions = {
  PROJECT_UPDATE: 'projects.update',
  ACTIVITY_CREATE: 'activities.create',
  ACTIVITY_UPDATE: 'activities.update',
  ACTIVITY_START: 'activities.complete',
  ACTIVITY_CANCEL: 'activities.update',
  ACTIVITY_REVIEW: 'evidence.review',
  ACTIVITY_PROOF_FINALIZE: 'activities.proof.submit',
  INDICATOR_CREATE: 'indicators.create',
  INDICATOR_UPDATE: 'indicators.update',
  INDICATOR_ARCHIVE: 'indicators.archive',
  INDICATOR_MEASUREMENT: 'indicators.update',
} as const

@Injectable()
export class RulesSourceOperationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  abandon(identity: ApplicationIdentity, projectId: string, value: unknown) {
    const parsed = requestSchema.safeParse(value)
    if (!parsed.success || !z.string().uuid().safeParse(projectId).success)
      throw new BadRequestException('Invalid mutation recovery request.')
    const input = parsed.data
    if (input.operation === 'ACTIVITY_PROOF_FINALIZE')
      throw new BadRequestException(
        'Proof recovery requires retrying the same update id and identical files.',
      )
    if (
      ['clientMutationId', 'clientMeasurementId', 'clientUpdateId'].some((field) =>
        Object.hasOwn(input.body, field),
      )
    )
      throw new BadRequestException('Invalid mutation recovery body.')
    const creates = ['ACTIVITY_CREATE', 'INDICATOR_CREATE'].includes(input.operation)
    if (
      creates !== (input.sourceId === null) ||
      (input.operation === 'PROJECT_UPDATE' &&
        input.sourceId?.toLowerCase() !== projectId.toLowerCase())
    )
      throw new BadRequestException('Invalid mutation recovery source.')
    const key: SourceRequestKey =
      input.operation === 'INDICATOR_MEASUREMENT'
        ? { kind: 'CLIENT_MEASUREMENT', id: input.requestId }
        : { kind: 'CLIENT_MUTATION', id: input.requestId }
    const body = sourceMutationBody(input.body)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      permissions[input.operation],
      async (tx) =>
        abandonRuleSourceOperation(tx, input.operation, projectId, input.sourceId, key, body),
    )
  }
}
