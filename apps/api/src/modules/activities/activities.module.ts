import { Module } from '@nestjs/common'

import { ActivitiesController, MilestonesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { PrivateProofInspectionService } from './private-proof-inspection.service'

@Module({
  controllers: [ActivitiesController, MilestonesController],
  providers: [ActivitiesService, PrivateProofInspectionService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
