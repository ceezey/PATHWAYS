import { Inject, Injectable } from '@nestjs/common'

import type { HealthStatus } from '@pathways/shared'

import packageInfo from '../../../package.json'
import { PrismaService } from '../../prisma/prisma.service'

export const READINESS_TIMEOUT_MS = 2000

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getStatus(): HealthStatus {
    return {
      status: 'ok',
      service: 'pathways-api',
      timestamp: new Date().toISOString(),
      version: packageInfo.version,
    }
  }

  /** True when the database answers a trivial query inside the limit. */
  async isReady(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS)
    })
    const answered = this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
    try {
      return await Promise.race([answered, timedOut])
    } finally {
      clearTimeout(timer)
    }
  }
}
