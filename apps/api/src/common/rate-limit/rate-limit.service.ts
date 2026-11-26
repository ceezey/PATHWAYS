import { Inject, Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class RateLimitService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Counts one hit in a fixed window; returns 0 when allowed, else the seconds to wait. */
  async hit(bucket: string, maxHits: number, windowSeconds = 60): Promise<number> {
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ s: unknown }>>`
        SELECT pathways.rate_limit_hit(${bucket}::text, ${maxHits}::integer, ${windowSeconds}::integer) AS s`
      return Number(row?.s ?? 0)
    } catch {
      // Fails open: the route needs the database itself and fails visibly on its own; errors can carry the bucket, so none is logged.
      new Logger('RateLimit').warn({ event: 'PATHWAYS_RATE_LIMIT_UNAVAILABLE' })
      return 0
    }
  }
}
