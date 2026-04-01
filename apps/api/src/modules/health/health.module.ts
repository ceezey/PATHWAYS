import { Module } from '@nestjs/common'

import { HealthController } from '@app/modules/health/health.controller'
import { HealthService } from '@app/modules/health/health.service'

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
