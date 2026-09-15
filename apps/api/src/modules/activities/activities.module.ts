import { Module } from '@nestjs/common'

import { ActivitiesController, MilestonesController } from './activities.controller'
import { ActivitiesService } from './activities.service'

@Module({
  controllers: [ActivitiesController, MilestonesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
