import { Injectable } from '@nestjs/common'

import type { HealthStatus } from '@pathways/shared'

import packageInfo from '../../../package.json'

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      status: 'ok',
      service: 'pathways-api',
      timestamp: new Date().toISOString(),
      version: packageInfo.version,
    }
  }
}
