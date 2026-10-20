import { Module } from '@nestjs/common'

import { ActivityEscalationsController } from './activity-escalations.controller'
import { ActivityEscalationsService } from './activity-escalations.service'

@Module({
  controllers: [ActivityEscalationsController],
  providers: [ActivityEscalationsService],
})
export class ActivityEscalationsModule {}
